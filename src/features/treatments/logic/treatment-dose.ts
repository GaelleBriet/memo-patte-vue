import { addFrequency } from './treatment-frequency'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { Treatment } from '../schema/treatment.schema'

export function doseGivenOn(
  treatment: Pick<Treatment, 'id' | 'animalId' | 'frequency'>,
  givenOn: string,
  { id, at }: { id: string; at: string },
): TreatmentDose {
  return {
    id,
    treatmentId: treatment.id,
    animalId: treatment.animalId,
    givenOn,
    nextDueDate: addFrequency(givenOn, treatment.frequency),
    frequency: { ...treatment.frequency },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}

/** Une prise plus ancienne que la dernière ne devient pas la tête : l'échéance ne bouge pas. */
export function nextDueAfterDose(
  treatment: Pick<Treatment, 'frequency' | 'lastDoseDate' | 'nextDueDate'>,
  givenOn: string,
): string {
  return givenOn > treatment.lastDoseDate
    ? addFrequency(givenOn, treatment.frequency)
    : treatment.nextDueDate
}
