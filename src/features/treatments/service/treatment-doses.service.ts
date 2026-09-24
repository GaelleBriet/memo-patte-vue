import { doseGivenOn } from '../logic/treatment-dose'
import {
  getTreatmentDosesRepository,
  type TreatmentDosesRepository,
} from '../repository/treatment-doses.repository'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import { treatmentInputSchema } from '../schema/treatment.schema'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from './treatment-reminders.service'

type Provider<T> = () => T | Promise<T>

export type TreatmentDosesDependencies = {
  treatments: Provider<Pick<TreatmentsRepository, 'getById'>>
  doses: Provider<Pick<TreatmentDosesRepository, 'record' | 'remove'>>
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
  now: () => Date
}

export type RecordedDose = {
  animalId: string
  /** `null` quand une prise du même jour était déjà notée : rien n'a été écrit. */
  doseId: string | null
}

export function createTreatmentDosesService({
  treatments,
  doses,
  reminders,
  now,
}: TreatmentDosesDependencies) {
  return {
    /** Lève pour une date future ou un traitement introuvable. */
    async record(treatmentId: string, givenOn: string): Promise<RecordedDose> {
      const date = treatmentInputSchema.shape.lastDoseDate.parse(givenOn)
      const treatment = await (await treatments()).getById(treatmentId)
      if (treatment === null) throw new Error(`Traitement introuvable : ${treatmentId}`)

      const dose = doseGivenOn(treatment, date, {
        id: crypto.randomUUID(),
        at: now().toISOString(),
      })
      const recorded = await (await doses()).record(dose)
      await reminders.reschedule(treatmentId)
      return { animalId: treatment.animalId, doseId: recorded ? dose.id : null }
    },

    async undo(treatmentId: string, doseId: string): Promise<void> {
      await (await doses()).remove(doseId, now().toISOString())
      await reminders.reschedule(treatmentId)
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
