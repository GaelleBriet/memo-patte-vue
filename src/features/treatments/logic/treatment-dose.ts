import { addFrequency } from './treatment-frequency'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { Treatment } from '../schema/treatment.schema'

/** Une prise donnée vise son propre jour : l'ordre des échéances reste celui des dates réelles. */
export function doseGivenOn(
  treatment: Pick<Treatment, 'id' | 'animalId' | 'periodId' | 'frequency'>,
  givenOn: string,
  { id, at }: { id: string; at: string },
): NewTreatmentDose {
  return {
    id,
    periodId: treatment.periodId,
    treatmentId: treatment.id,
    animalId: treatment.animalId,
    dueOn: givenOn,
    dueTime: null,
    givenOn,
    status: 'given',
    nextDueDate: addFrequency(givenOn, treatment.frequency),
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
  return treatment.lastDoseDate === null || givenOn > treatment.lastDoseDate
    ? addFrequency(givenOn, treatment.frequency)
    : treatment.nextDueDate
}
