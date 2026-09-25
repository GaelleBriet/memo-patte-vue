import { doseGivenOn } from '../logic/treatment-dose'
import { doseDatesOn } from '../logic/treatment-history'
import {
  getTreatmentDosesRepository,
  type DoseDates,
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
  doses: Provider<
    Pick<TreatmentDosesRepository, 'record' | 'remove' | 'getById' | 'revive' | 'changeDate'>
  >
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
      const removed = await (await doses()).remove(doseId, now().toISOString())
      if (!removed) throw new Error(`Prise non annulée : ${doseId}`)
      await reminders.reschedule(treatmentId)
    },

    /** Lève pour la seule prise du traitement : c'est le traitement qu'on supprime alors. */
    async remove(treatmentId: string, doseId: string): Promise<void> {
      const removed = await (await doses()).remove(doseId, now().toISOString())
      if (!removed) throw new Error(`Prise non supprimée : ${doseId}`)
      await reminders.reschedule(treatmentId)
    },

    async undoRemove(treatmentId: string, doseId: string): Promise<void> {
      const revived = await (await doses()).revive(doseId, now().toISOString())
      if (!revived) throw new Error(`Prise non rétablie : ${doseId}`)
      await reminders.reschedule(treatmentId)
    },

    /** Renvoie les dates d'avant, pour « Annuler ». Lève pour une date future ou déjà notée. */
    async changeDate(treatmentId: string, doseId: string, givenOn: string): Promise<DoseDates> {
      const date = treatmentInputSchema.shape.lastDoseDate.parse(givenOn)
      const dose = await (await doses()).getById(doseId)
      if (dose === null) throw new Error(`Prise introuvable : ${doseId}`)

      await writeDates(treatmentId, doseId, doseDatesOn(dose, date))
      return { givenOn: dose.givenOn, nextDueDate: dose.nextDueDate, frequency: dose.frequency }
    },

    undoChangeDate(treatmentId: string, doseId: string, previous: DoseDates): Promise<void> {
      return writeDates(treatmentId, doseId, previous)
    },
  }

  async function writeDates(treatmentId: string, doseId: string, dates: DoseDates): Promise<void> {
    const changed = await (await doses()).changeDate(doseId, dates, now().toISOString())
    if (!changed) throw new Error(`Prise non modifiée : ${doseId}`)
    await reminders.reschedule(treatmentId)
  }
}

export type TreatmentDosesService = ReturnType<typeof createTreatmentDosesService>

export const treatmentDosesService = createTreatmentDosesService({
  treatments: getTreatmentsRepository,
  doses: getTreatmentDosesRepository,
  reminders: treatmentRemindersService,
  now: () => new Date(),
})
