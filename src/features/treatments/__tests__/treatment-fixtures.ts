import type { DoseWrite } from '../repository/treatment-doses.repository'
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
    referenceOn: overrides.firstDueOn ?? '2026-09-01',
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

/** Ligne de décalage : après la journée de `dueOn`, les doses suivent le rythme ancré à `anchoredOn`. */
export function shifted(
  dueOn: string,
  anchoredOn: string,
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  return dose(dueOn, anchoredOn, {
    id: `décalage ${dueOn}`,
    givenOn: null,
    status: 'shift',
    ...overrides,
  })
}

/** Prise en plus, rangée sous sa date réelle. */
export function extra(
  givenOn: string,
  nextDueDate: string,
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  return dose(givenOn, nextDueDate, { id: `en plus ${givenOn}`, status: 'extra', ...overrides })
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

/** Le carnet après un lot d'écritures, comme `applyBatch` le laisserait. */
export function written(
  history: TreatmentWithHistory,
  writes: readonly DoseWrite[],
  at = '2026-09-28T12:00:00.000Z',
): TreatmentWithHistory {
  const doses = writes.reduce((lines, write) => {
    switch (write.action) {
      case 'create':
        return [
          ...lines,
          {
            ...write.dose,
            id: write.id,
            treatmentId: write.treatmentId,
            animalId: write.animalId,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
          },
        ]
      case 'rewrite':
        return lines.map((line) =>
          line.id === write.id ? { ...line, ...write.dose, updatedAt: at } : line,
        )
      case 'delete':
        return lines.filter(({ id }) => id !== write.id)
      case 'restore':
        throw new Error('Une restauration ne se rejoue pas sur un carnet de test.')
    }
  }, history.doses)
  return { ...history, doses }
}

/** Le même objet, espaces insécables remplacées : les attentes s'écrivent au clavier. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('\u00a0', ' ')) as T
}
