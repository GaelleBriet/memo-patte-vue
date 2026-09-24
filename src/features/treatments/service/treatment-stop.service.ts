import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from './treatment-reminders.service'

type Provider<T> = () => T | Promise<T>

export type TreatmentStopDependencies = {
  treatments: Provider<Pick<TreatmentsRepository, 'getById' | 'stop' | 'undoStop'>>
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
  today: () => string
}

export type StoppedTreatment = {
  animalId: string
  /** Faux quand le traitement était déjà arrêté : rien n'a été écrit. */
  stopped: boolean
}

export function createTreatmentStopService({
  treatments,
  reminders,
  today,
}: TreatmentStopDependencies) {
  return {
    /** Arrêté aujourd'hui : plus aucun rappel, les prises restent. Lève pour un traitement introuvable. */
    async stop(treatmentId: string): Promise<StoppedTreatment> {
      const repository = await treatments()
      const treatment = await repository.getById(treatmentId)
      if (treatment === null) throw new Error(`Traitement introuvable : ${treatmentId}`)

      const stopped = await repository.stop(treatmentId, today())
      await reminders.reschedule(treatmentId)
      return { animalId: treatment.animalId, stopped }
    },

    async undo(treatmentId: string): Promise<void> {
      await (await treatments()).undoStop(treatmentId)
      await reminders.reschedule(treatmentId)
    },
  }
}

export type TreatmentStopService = ReturnType<typeof createTreatmentStopService>

export const treatmentStopService = createTreatmentStopService({
  treatments: getTreatmentsRepository,
  reminders: treatmentRemindersService,
  today: todayIsoDate,
})
