import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { doseChange, type DoseAction, type DoseChange } from '../logic/treatment-dose-writes'
import { hasSeveralTimes } from '../logic/treatment-gestures'
import { isDayNoted, momentDue } from '../logic/treatment-other-date'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import {
  DuplicateDueError,
  getTreatmentDosesRepository,
  type DoseWrite,
  type TreatmentDosesRepository,
} from '../repository/treatment-doses.repository'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
  type TreatmentWithHistory,
} from '../repository/treatments.repository'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from './treatment-reminders.service'

type Provider<T> = () => T | Promise<T>

export type TreatmentDosesDependencies = {
  treatments: Provider<Pick<TreatmentsRepository, 'getWithHistory'>>
  doses: Provider<Pick<TreatmentDosesRepository, 'applyBatch'>>
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
  now: () => Date
  today?: () => string
}

export type AppliedDoseChange = Omit<DoseChange, 'writes'> & {
  animalId: string
  /** Lot inverse, à passer à `undoBatch` ; vide quand rien n'a été écrit. */
  undo: DoseWrite[]
}

export type NotedMoment = AppliedDoseChange & {
  /**
   * `already` : l'échéance était déjà notée ; `day-noted` : toutes les doses du jour sont notées,
   * aucune donnée ; `none` : plus aucune dose à noter ; `ask` : la dose à
   * noter n'est pas celle de la notification, à la personne de choisir. Rien n'est écrit hors de
   * `noted`.
   */
  outcome: 'noted' | 'already' | 'day-noted' | 'none' | 'ask'
  /** Échéance notée ; `null` hors de `noted`. */
  due: Due | null
  severalTimes: boolean
}

export function createTreatmentDosesService({
  treatments,
  doses,
  reminders,
  now,
  today = todayIsoDate,
}: TreatmentDosesDependencies) {
  async function write(treatmentId: string, writes: readonly DoseWrite[]): Promise<DoseWrite[]> {
    if (writes.length === 0) return []
    const inverse = await (await doses()).applyBatch(writes, now().toISOString())
    await reminders.reschedule(treatmentId)
    return inverse
  }

  async function historyOf(treatmentId: string): Promise<TreatmentWithHistory> {
    const history = await (await treatments()).getWithHistory(treatmentId)
    if (history === null) throw new Error(`Traitement introuvable : ${treatmentId}`)
    return history
  }

  async function alreadyNoted(action: DoseAction, treatmentId: string): Promise<string | null> {
    if (action.kind !== 'note' || action.gesture.kind !== 'given') return null
    const { due, givenOn } = action.gesture
    const { doses: lines } = await historyOf(treatmentId)
    const line = lines.find(
      (dose) =>
        dose.periodId === due.periodId &&
        dose.dueOn === due.dueOn &&
        dose.dueTime === due.dueTime &&
        dose.status !== 'postponed',
    )
    return line === undefined ? null : (line.givenOn ?? givenOn)
  }

  async function run(
    history: TreatmentWithHistory,
    schedule: TreatmentSchedule,
    action: DoseAction,
  ): Promise<AppliedDoseChange> {
    const { writes, ...change } = doseChange(history, schedule, action, () => crypto.randomUUID())
    const { animalId } = history
    try {
      return { ...change, animalId, undo: await write(history.id, writes) }
    } catch (cause) {
      const alreadyGivenOn =
        cause instanceof DuplicateDueError ? await alreadyNoted(action, history.id) : null
      if (alreadyGivenOn === null) throw cause
      return { animalId, undo: [], alreadyGivenOn, postponement: null, moved: null }
    }
  }

  return {
    /** Geste de la fiche, en une écriture ; lève quand le moteur d'échéances le refuse. */
    async apply(treatmentId: string, action: DoseAction): Promise<AppliedDoseChange> {
      const history = await historyOf(treatmentId)
      return run(history, treatmentScheduleOf(history, today()), action)
    },

    /**
     * Prise notée sans échéance choisie (feuille « À faire », notification) ; `notifiedDueOn` : le
     * jour d'échéance de la notification touchée.
     */
    async noteMoment(
      treatmentId: string,
      givenOn: string,
      { notifiedDueOn = null }: { notifiedDueOn?: string | null } = {},
    ): Promise<NotedMoment> {
      const day = today()
      const history = await historyOf(treatmentId)
      const schedule = treatmentScheduleOf(history, day)
      const nothing = {
        animalId: history.animalId,
        undo: [],
        alreadyGivenOn: null,
        postponement: null,
        moved: null,
        due: null,
        severalTimes: false,
      }
      if (notifiedDueOn !== null && isDayNoted(schedule, notifiedDueOn)) {
        return { ...nothing, outcome: 'ask' }
      }
      const target = momentDue(schedule, givenOn, day)
      if (target === null) return { ...nothing, outcome: 'none' }
      if ('dayNoted' in target) return { ...nothing, outcome: 'day-noted' }
      if ('alreadyGivenOn' in target) {
        return { ...nothing, outcome: 'already', alreadyGivenOn: target.alreadyGivenOn }
      }
      const { due } = target
      if (notifiedDueOn !== null && due.dueOn !== notifiedDueOn) {
        return { ...nothing, outcome: 'ask' }
      }
      const applied = await run(history, schedule, {
        kind: 'note',
        gesture: { kind: 'given', due, givenOn },
      })
      if (applied.alreadyGivenOn !== null) return { ...nothing, ...applied, outcome: 'already' }
      return {
        ...applied,
        outcome: 'noted',
        due,
        severalTimes: hasSeveralTimes(history, due.periodId),
      }
    },

    async undoBatch(treatmentId: string, writes: readonly DoseWrite[]): Promise<void> {
      await write(treatmentId, writes)
    },
  }
}

export type TreatmentDosesService = ReturnType<typeof createTreatmentDosesService>

export const treatmentDosesService = createTreatmentDosesService({
  treatments: getTreatmentsRepository,
  doses: getTreatmentDosesRepository,
  reminders: treatmentRemindersService,
  now: () => new Date(),
})
