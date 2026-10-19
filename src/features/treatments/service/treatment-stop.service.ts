import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { currentDeviceId } from '@/core/device/device-identity'
import {
  DoseAlreadyLoggedError,
  doseChange,
  type NoteGesture,
} from '../logic/treatment-dose-change'
import { readableReadingOf, treatmentReadingOf } from '../logic/treatment-reading-adapter'
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
  getTreatmentPeriodsRepository,
  type TreatmentPeriodStopper,
} from '../repository/treatment-periods.repository'
import {
  getTreatmentsRepository,
  type TreatmentWithHistoryReader,
} from '../repository/treatments.repository'
import type { TreatmentWithPeriods } from '../schema/treatment-with-history.schema'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from './treatment-reminders.service'

type Provider<T> = () => T | Promise<T>

export type TreatmentStopDependencies = {
  treatments: Provider<TreatmentWithHistoryReader>
  periods: Provider<TreatmentPeriodStopper>
  doses: Provider<TreatmentDoseWriter>
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
  today: () => string
  now: () => Date
  newId: () => string
  queue?: WriteQueue
  deviceId?: () => string
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
  queue = createWriteQueue(),
  deviceId = currentDeviceId,
}: TreatmentStopDependencies) {
  async function treatmentOf(treatmentId: string): Promise<TreatmentWithPeriods> {
    const treatment = await (await treatments()).getWithHistory(treatmentId)
    if (treatment === null) throw new Error(`Traitement introuvable : ${treatmentId}`)
    return treatment
  }

  // Le réglage en cours est celui que lit le moteur, pas la période que la base classe en dernier.
  function currentPeriodId(treatment: TreatmentWithPeriods): string {
    const current = readableReadingOf(treatment, today())?.view.currentSetting
    const id = current?.id ?? treatment.periods.at(-1)?.id
    if (id === undefined) throw new Error(`Traitement sans période : ${treatment.id}`)
    return id
  }

  /** Rien à écrire : traitement déjà arrêté, ou fini par sa date de fin ; `null` sinon. */
  function unchanged(treatment: TreatmentWithPeriods): StoppedTreatment | null {
    const view = readableReadingOf(treatment, today())?.view
    if (view === undefined || (view.phase !== 'stopped' && view.phase !== 'ended')) return null
    return { animalId: treatment.animalId, stopped: false, finished: view.finished, undo: [] }
  }

  async function logAndStop(
    treatment: TreatmentWithPeriods,
    gestures: readonly NoteGesture[],
  ): Promise<DoseWrite[]> {
    const reading = treatmentReadingOf(treatment, today(), deviceId())
    const { writes } = doseChange(treatment, reading, { kind: 'log', gestures }, newId)
    const at = now().toISOString()
    const repository = await periods()
    const periodId = currentPeriodId(treatment)
    const stop = [
      repository.notStoppedGuardStatement(periodId),
      repository.stopStatement(periodId, today(), at),
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

  async function stopped(
    treatmentId: string,
    gestures: readonly NoteGesture[],
  ): Promise<StoppedTreatment> {
    const treatment = await treatmentOf(treatmentId)
    const notStopped = unchanged(treatment)
    if (notStopped !== null) return notStopped

    let undo: DoseWrite[] = []
    if (gestures.length > 0) {
      try {
        undo = await logAndStop(treatment, gestures)
      } catch (cause) {
        if (cause instanceof DoseAlreadyLoggedError) throw cause
        const stoppedElsewhere = unchanged(await treatmentOf(treatmentId))
        if (stoppedElsewhere === null) throw cause
        return stoppedElsewhere
      }
    }
    const stopped =
      gestures.length > 0 || (await (await periods()).stop(currentPeriodId(treatment), today()))
    await reminders.reschedule(treatmentId)
    const finished =
      readableReadingOf(await treatmentOf(treatmentId), today())?.view.finished ?? false
    return { animalId: treatment.animalId, stopped, finished, undo }
  }

  async function undone(treatmentId: string, writes: readonly DoseWrite[]): Promise<void> {
    const periodId = currentPeriodId(await treatmentOf(treatmentId))
    if (writes.length === 0) await (await periods()).undoStop(periodId)
    else {
      const at = now().toISOString()
      const undoStop = (await periods()).undoStopStatement(periodId, at)
      await (await doses()).applyBatch(writes, at, [undoStop])
    }
    await reminders.reschedule(treatmentId)
  }

  return {
    /**
     * Période en cours arrêtée aujourd'hui, et les doses de `gestures` renseignées dans la même
     * transaction : plus aucun rappel, les prises restent. Rien n'est écrit pour un traitement déjà
     * arrêté ou fini par sa date de fin, y compris arrêté ailleurs entre la lecture et l'écriture.
     * Lève pour un traitement introuvable, et une `DoseAlreadyLoggedError` quand une dose du lot est
     * déjà notée.
     */
    stop(treatmentId: string, gestures: readonly NoteGesture[] = []): Promise<StoppedTreatment> {
      return queue(() => stopped(treatmentId, gestures))
    },

    /** Défait l'arrêt et, avec lui, les prises de `writes`, en une transaction. */
    undo(treatmentId: string, writes: readonly DoseWrite[] = []): Promise<void> {
      return queue(() => undone(treatmentId, writes))
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
  queue: treatmentWriteQueue,
})
