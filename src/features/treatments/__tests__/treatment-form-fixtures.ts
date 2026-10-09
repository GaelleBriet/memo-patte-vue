import { treatmentFormValuesFrom, type TreatmentFormValues } from '../logic/treatment-form-values'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

export const AT = '2026-07-01T08:00:00.000Z'
export const MILO = '11111111-1111-4111-8111-111111111111'
export const TREATMENT = '22222222-2222-4222-8222-222222222222'
export const TODAY = '2026-09-28'

export function period(overrides: Partial<TreatmentPeriodRecord> = {}): TreatmentPeriodRecord {
  return {
    id: TREATMENT,
    treatmentId: TREATMENT,
    animalId: MILO,
    startsOn: '2026-07-10',
    firstDueOn: '2026-07-10',
    referenceOn: '2026-07-10',
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 3, unit: 'month' },
    times: [],
    doseQuantity: 1.5,
    doseUnit: 'tablet',
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

export const PRISE: NewTreatmentDose = {
  id: 'd-1',
  periodId: TREATMENT,
  treatmentId: TREATMENT,
  animalId: MILO,
  dueOn: '2026-07-10',
  dueTime: null,
  givenOn: '2026-07-10',
  status: 'given',
  nextDueDate: '2026-10-10',
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
}

export function milbemax(
  periods: TreatmentPeriodRecord[] = [period()],
  doses: NewTreatmentDose[] = [PRISE],
): TreatmentWithHistory {
  return {
    id: TREATMENT,
    animalId: MILO,
    name: 'Milbemax',
    type: 'deworming',
    createdAt: AT,
    updatedAt: AT,
    periods,
    doses,
  }
}

export function saisie(changes: Partial<TreatmentFormValues> = {}): TreatmentFormValues {
  return {
    name: 'Panacur',
    type: 'deworming',
    frequencyValue: '1',
    frequencyUnit: 'day',
    firstDoseOn: '2026-09-29',
    nextDoseOn: '',
    shiftsFollowing: true,
    times: ['20:00'],
    doseQuantity: '½',
    doseUnit: 'tablet',
    endsOn: '2026-10-10',
    reminderOffset: null,
    reminderTime: null,
    ...changes,
  }
}

export function edition(changes: Partial<TreatmentFormValues> = {}): TreatmentFormValues {
  return {
    ...treatmentFormValuesFrom(milbemax(), period()),
    nextDoseOn: '2026-10-10',
    ...changes,
  }
}
