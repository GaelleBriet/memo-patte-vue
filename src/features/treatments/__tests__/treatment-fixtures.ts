import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'

export const AT = '2026-09-01T08:00:00.000Z'

export function period(overrides: Partial<TreatmentPeriodRecord> = {}): TreatmentPeriodRecord {
  return {
    id: 'p-1',
    treatmentId: 'metacam',
    animalId: 'luna',
    startsOn: '2026-09-01',
    firstDueOn: '2026-09-01',
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 1, unit: 'day' },
    times: [],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

/** Prise donnée le jour de son échéance, sauf mention ; `id` vaut l'échéance par défaut. */
export function dose(
  dueOn: string,
  nextDueDate: string,
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  const dueTime = overrides.dueTime ?? null
  return {
    id: dueTime === null ? dueOn : `${dueOn} ${dueTime}`,
    periodId: 'p-1',
    treatmentId: 'metacam',
    animalId: 'luna',
    dueOn,
    dueTime,
    givenOn: dueOn,
    status: 'given',
    nextDueDate,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

export function missed(
  dueOn: string,
  nextDueDate: string,
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  return dose(dueOn, nextDueDate, { givenOn: null, status: 'missed', ...overrides })
}

export function postponed(
  dueOn: string,
  to: string,
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  return dose(dueOn, to, {
    id: `report ${dueOn}`,
    givenOn: null,
    status: 'postponed',
    ...overrides,
  })
}

export function treatment(
  periods: TreatmentPeriodRecord[],
  doses: NewTreatmentDose[] = [],
): TreatmentWithHistory {
  return {
    id: 'metacam',
    animalId: 'luna',
    name: 'Métacam',
    type: 'medication',
    createdAt: AT,
    updatedAt: AT,
    periods,
    doses,
  }
}

/** Le même objet, espaces insécables remplacées : les attentes s'écrivent au clavier. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('\u00a0', ' ')) as T
}
