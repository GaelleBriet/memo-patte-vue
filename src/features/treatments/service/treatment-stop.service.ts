import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import type { DoseGesture } from '@/shared/domain/treatment-schedule'
import { DoseAlreadyLoggedError, doseChange } from '../logic/treatment-dose-writes'
import { readableScheduleOf, treatmentScheduleOf } from '../logic/treatment-schedule'
import {
  DuplicateDueError,
  getTreatmentDosesRepository,
  type DoseWrite,
  type TreatmentDosesRepository,
} from '../repository/treatment-doses.repository'
import {
  getTreatmentPeriodsRepository,
  type TreatmentPeriodsRepository,
} from '../repository/treatment-periods.repository'
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

export type TreatmentStopDependencies = {
  treatments: Provider<Pick<TreatmentsRepository, 'getWithHistory'>>
  periods: Provider<
    Pick<
      TreatmentPeriodsRepository,
      'stop' | 'undoStop' | 'stopStatement' | 'notStoppedGuardStatement' | 'undoStopStatement'
    >
  >
  doses: Provider<Pick<TreatmentDosesRepository, 'applyBatch'>>
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
  today: () => string
  now: () => Date
  newId: () => string
}

export type StoppedTreatment = {
  animalId: string
  /** Faux quand le traitement était déjà arrêté : rien n'a été écrit. */
  stopped: boolean
  /** Plus rien à renseigner : le traitement est dans « Traitements terminés ». */
  finished: boolean
  /** Lot inverse des prises renseignées avec l'arrêt, à passer à `undo` ; vide sans prise écrite. */
  undo: DoseWrite[]
}

export function createTreatmentStopService({
  treatments,
  periods,
  doses,
  reminders,
  today,
  now,
  newId,
}: TreatmentStopDependencies) {
  async function historyOf(treatmentId: string): Promise<TreatmentWithHistory> {
    const history = await (await treatments()).getWithHistory(treatmentId)
    if (history === null) throw new Error(`Traitement introuvable : ${treatmentId}`)
    return history
  }

  /** Rien à écrire : traitement déjà arrêté, ou fini par sa date de fin ; `null` sinon. */
  function unchanged(history: TreatmentWithHistory): StoppedTreatment | null {
    const schedule = readableScheduleOf(history, today())
    const isStopped = (history.periods.at(-1)?.stoppedOn ?? null) !== null
    if (!isStopped && schedule?.phase !== 'ended') return null
    return {
      animalId: history.animalId,
      stopped: false,
      finished: schedule?.finished ?? false,
      undo: [],
    }
  }

  async function logAndStop(
    history: TreatmentWithHistory,
    gestures: readonly DoseGesture[],
  ): Promise<DoseWrite[]> {
    const schedule = treatmentScheduleOf(history, today())
    const { writes } = doseChange(history, schedule, { kind: 'log', gestures }, newId)
    const at = now().toISOString()
    const repository = await periods()
    const stop = [
      repository.notStoppedGuardStatement(history.id),
      repository.stopStatement(history.id, today(), at),
    ]
    try {
      return await (await doses()).applyBatch(writes, at, stop)
    } catch (cause) {
      if (cause instanceof DuplicateDueError) {
        throw new DoseAlreadyLoggedError(cause.message, { cause })
      }
      throw cause
    }
  }

  return {
    /**
     * Période en cours arrêtée aujourd'hui, et les doses de `gestures` renseignées dans la même
     * transaction : plus aucun rappel, les prises restent. Rien n'est écrit pour un traitement déjà
     * arrêté ou fini par sa date de fin, y compris arrêté ailleurs entre la lecture et l'écriture.
     * Lève pour un traitement introuvable, et une `DoseAlreadyLoggedError` quand une dose du lot est
     * déjà notée.
     */
    async stop(
      treatmentId: string,
      gestures: readonly DoseGesture[] = [],
    ): Promise<StoppedTreatment> {
      const history = await historyOf(treatmentId)
      const notStopped = unchanged(history)
      if (notStopped !== null) return notStopped

      let undo: DoseWrite[] = []
      if (gestures.length > 0) {
        try {
          undo = await logAndStop(history, gestures)
        } catch (cause) {
          if (cause instanceof DoseAlreadyLoggedError) throw cause
          const stoppedElsewhere = unchanged(await historyOf(treatmentId))
          if (stoppedElsewhere === null) throw cause
          return stoppedElsewhere
        }
      }
      const stopped = gestures.length > 0 || (await (await periods()).stop(treatmentId, today()))
      await reminders.reschedule(treatmentId)
      const finished = readableScheduleOf(await historyOf(treatmentId), today())?.finished ?? false
      return { animalId: history.animalId, stopped, finished, undo }
    },

    /** Défait l'arrêt et, avec lui, les prises de `writes`, en une transaction. */
    async undo(treatmentId: string, writes: readonly DoseWrite[] = []): Promise<void> {
      if (writes.length === 0) await (await periods()).undoStop(treatmentId)
      else {
        const at = now().toISOString()
        const undoStop = (await periods()).undoStopStatement(treatmentId, at)
        await (await doses()).applyBatch(writes, at, [undoStop])
      }
      await reminders.reschedule(treatmentId)
    },
  }
}

export type TreatmentStopService = ReturnType<typeof createTreatmentStopService>

export const treatmentStopService = createTreatmentStopService({
  treatments: getTreatmentsRepository,
  periods: getTreatmentPeriodsRepository,
  doses: getTreatmentDosesRepository,
  reminders: treatmentRemindersService,
  today: todayIsoDate,
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
})
