import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { doseGivenOn } from '../logic/treatment-dose'
import { doseChange, type DoseAction, type DoseChange } from '../logic/treatment-dose-writes'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import {
  getTreatmentDosesRepository,
  type DoseWrite,
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
  treatments: Provider<Pick<TreatmentsRepository, 'getById' | 'getWithHistory'>>
  doses: Provider<Pick<TreatmentDosesRepository, 'record' | 'remove' | 'applyBatch'>>
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
  now: () => Date
  today?: () => string
}

export type RecordedDose = {
  animalId: string
  /** `null` quand une prise du même jour était déjà notée : rien n'a été écrit. */
  doseId: string | null
}

export type AppliedDoseChange = Pick<DoseChange, 'alreadyGivenOn' | 'postponement'> & {
  animalId: string
  /** Lot inverse, à passer à `undoBatch` ; vide quand rien n'a été écrit. */
  undo: DoseWrite[]
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

    /** Geste de la fiche, en une écriture ; lève quand le moteur d'échéances le refuse. */
    async apply(treatmentId: string, action: DoseAction): Promise<AppliedDoseChange> {
      const history = await (await treatments()).getWithHistory(treatmentId)
      if (history === null) throw new Error(`Traitement introuvable : ${treatmentId}`)

      const { writes, alreadyGivenOn, postponement } = doseChange(
        history,
        treatmentScheduleOf(history, today()),
        action,
        () => crypto.randomUUID(),
      )
      const undo = await write(treatmentId, writes)
      return { animalId: history.animalId, undo, alreadyGivenOn, postponement }
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
