import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { currentDeviceId } from '@/core/device/device-identity'
import type { Due, TreatmentView } from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'
import {
  DoseAlreadyLoggedError,
  doseChange,
  type DoseAction,
  type DoseChange,
} from '../logic/treatment-dose-change'
import { hasSeveralTimes } from '../logic/treatment-gestures'
import { momentDue, notifiedDue } from '../logic/treatment-other-date'
import {
  currentPeriodOf,
  readableReadingOf,
  treatmentReadingOf,
} from '../logic/treatment-reading-adapter'
import { undoKeepingAhead } from '../logic/treatment-undo-order'
import {
  createWriteQueue,
  treatmentWriteQueue,
  type WriteQueue,
} from '../logic/treatment-write-queue'
import {
  DuplicateDueError,
  getTreatmentDosesRepository,
  type TreatmentDoseWriter,
} from '../repository/treatment-doses.repository'
import type { DoseWrite } from '../schema/treatment-dose.schema'
import {
  getTreatmentsRepository,
  type TreatmentWithHistoryReader,
} from '../repository/treatments.repository'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from './treatment-reminders.service'

type Provider<T> = () => T | Promise<T>

export type TreatmentDosesDependencies = {
  treatments: Provider<TreatmentWithHistoryReader>
  doses: Provider<TreatmentDoseWriter>
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
  now: () => Date
  today?: () => string
  queue?: WriteQueue
  deviceId?: () => string
}

export type AppliedDoseChange = Omit<DoseChange, 'writes' | 'keptAhead'> & {
  animalId: string
  /** Le geste a terminé le traitement : plus rien à noter ni à renseigner (TR-31). */
  finishes: boolean
  /** Lot inverse, à passer à `undoBatch` ; vide quand rien n'a été écrit. */
  undo: DoseWrite[]
}

export type NotedMoment = AppliedDoseChange & {
  /**
   * `already` : l'échéance était déjà notée ; `day-noted` : toutes les doses du jour sont notées,
   * aucune donnée ; `none` : plus aucune dose à noter ; `ask` : la dose à
   * noter n'est pas clairement celle de la notification, à la personne de choisir. Rien n'est écrit hors de
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
  queue = createWriteQueue(),
  deviceId = currentDeviceId,
}: TreatmentDosesDependencies) {
  async function write(treatmentId: string, writes: readonly DoseWrite[]): Promise<DoseWrite[]> {
    if (writes.length === 0) return []
    const inverse = await (await doses()).applyBatch(writes, now().toISOString())
    await reminders.reschedule(treatmentId)
    return inverse
  }

  async function treatmentOf(treatmentId: string): Promise<TreatmentWithHistory> {
    const treatment = await (await treatments()).getWithHistory(treatmentId)
    if (treatment === null) throw new Error(`Traitement introuvable : ${treatmentId}`)
    return treatment
  }

  // Seule une période close ou à date de fin peut se terminer : les autres ne sont pas relues.
  async function finishedBy(before: TreatmentWithHistory, view: TreatmentView): Promise<boolean> {
    const current = currentPeriodOf(before, view)
    if (view.finished || (current?.endsOn ?? current?.stoppedOn ?? null) === null) return false
    return readableReadingOf(await treatmentOf(before.id), today())?.view.finished ?? false
  }

  async function alreadyNoted(action: DoseAction, treatmentId: string): Promise<string | null> {
    if (action.kind !== 'note' || action.gesture.status !== 'given') return null
    const { due, givenOn } = action.gesture
    const { doses: lines } = await treatmentOf(treatmentId)
    const line = lines.find(
      (dose) =>
        dose.periodId === due.settingId &&
        dose.dueTime === due.dueTime &&
        ((dose.dueOn === due.dueOn && (dose.status === 'given' || dose.status === 'missed')) ||
          (dose.dueOn === givenOn && dose.status === 'extra')),
    )
    return line === undefined ? null : (line.givenOn ?? givenOn)
  }

  async function run(
    treatment: TreatmentWithHistory,
    reading: TreatmentReading,
    action: DoseAction,
  ): Promise<AppliedDoseChange> {
    const { writes, keptAhead, ...change } = doseChange(treatment, reading, action, () =>
      crypto.randomUUID(),
    )
    const { animalId } = treatment
    try {
      const inverse = await write(treatment.id, writes)
      const undo = keptAhead === undefined ? inverse : undoKeepingAhead(inverse, keptAhead)
      const finishes = undo.length > 0 && (await finishedBy(treatment, reading.view))
      return { ...change, animalId, finishes, undo }
    } catch (cause) {
      if (cause instanceof DuplicateDueError && action.kind === 'log') {
        throw new DoseAlreadyLoggedError(cause.message, { cause })
      }
      const alreadyGivenOn =
        cause instanceof DuplicateDueError ? await alreadyNoted(action, treatment.id) : null
      if (alreadyGivenOn === null) throw cause
      return {
        animalId,
        finishes: false,
        undo: [],
        alreadyGivenOn,
        lostToEnd: [],
        followed: [],
        moved: null,
        shiftKept: false,
        revealed: null,
      }
    }
  }

  async function noted(
    treatmentId: string,
    givenOn: string,
    notifiedDueOn: string | null,
  ): Promise<NotedMoment> {
    const day = today()
    const treatment = await treatmentOf(treatmentId)
    const reading = treatmentReadingOf(treatment, day, deviceId())
    const nothing = {
      animalId: treatment.animalId,
      finishes: false,
      undo: [],
      alreadyGivenOn: null,
      lostToEnd: [],
      followed: [],
      moved: null,
      shiftKept: false,
      revealed: null,
      due: null,
      severalTimes: false,
    }
    const target =
      notifiedDueOn === null
        ? momentDue(reading, givenOn, day)
        : notifiedDue(reading, notifiedDueOn, day)
    if (target === 'ask') return { ...nothing, outcome: 'ask' }
    if (target === null) return { ...nothing, outcome: 'none' }
    if ('dayNoted' in target) return { ...nothing, outcome: 'day-noted' }
    if ('alreadyGivenOn' in target) {
      return { ...nothing, outcome: 'already', alreadyGivenOn: target.alreadyGivenOn }
    }
    const { due } = target
    const applied = await run(treatment, reading, {
      kind: 'note',
      gesture: { kind: 'note', due, status: 'given', givenOn, shiftsFollowing: false },
    })
    if (applied.alreadyGivenOn !== null) return { ...nothing, ...applied, outcome: 'already' }
    return {
      ...applied,
      outcome: 'noted',
      due,
      severalTimes: hasSeveralTimes(treatment, due.settingId),
    }
  }

  return {
    /**
     * Geste de la fiche, en une écriture ; lève quand le moteur d'échéances le refuse, et une
     * `DoseAlreadyLoggedError` quand une dose d'un lot `log` est déjà notée.
     */
    apply(treatmentId: string, action: DoseAction): Promise<AppliedDoseChange> {
      return queue(async () => {
        const treatment = await treatmentOf(treatmentId)
        return run(treatment, treatmentReadingOf(treatment, today(), deviceId()), action)
      })
    },

    /**
     * Prise notée sans échéance choisie (feuille « À faire », notification) ; `notifiedDueOn` : le
     * jour d'échéance de la notification touchée.
     */
    noteMoment(
      treatmentId: string,
      givenOn: string,
      { notifiedDueOn = null }: { notifiedDueOn?: string | null } = {},
    ): Promise<NotedMoment> {
      return queue(() => noted(treatmentId, givenOn, notifiedDueOn))
    },

    async undoBatch(treatmentId: string, writes: readonly DoseWrite[]): Promise<void> {
      await queue(() => write(treatmentId, writes))
    },
  }
}

export type TreatmentDosesService = ReturnType<typeof createTreatmentDosesService>

export const treatmentDosesService = createTreatmentDosesService({
  treatments: getTreatmentsRepository,
  doses: getTreatmentDosesRepository,
  reminders: treatmentRemindersService,
  now: () => new Date(),
  queue: treatmentWriteQueue,
})
