import type { DoseWrite } from '../schema/treatment-dose.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { legacyFactsOf } from '@/shared/domain/dose-calendar'

export const AT = '2026-09-01T08:00:00.000Z'

export function period(overrides: Partial<TreatmentPeriodRecord> = {}): TreatmentPeriodRecord {
  const record = {
    id: 'p-1',
    treatmentId: 'metacam',
    animalId: 'luna',
    startsOn: '2026-09-01',
    firstDueOn: '2026-09-01',
    gridOriginOn: overrides.firstDueOn ?? '2026-09-01',
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
  } satisfies Partial<TreatmentPeriodRecord>
  return { ...legacyFactsOf(record.gridOriginOn), ...record }
}

/**
 * Prise donnée le jour de son échéance, sauf mention ; `id` vaut l'échéance par défaut. `next` ne
 * s'écrit que pour un report (jour d'arrivée) ou un décalage (jour d'ancrage).
 */
export function dose(
  dueOn: string,
  next: string,
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  const dueTime = overrides.dueTime ?? null
  const status = overrides.status ?? 'given'
  return {
    id: dueTime === null ? dueOn : `${dueOn} ${dueTime}`,
    periodId: 'p-1',
    treatmentId: 'metacam',
    animalId: 'luna',
    dueOn,
    dueTime,
    givenOn: dueOn,
    status: 'given',
    targetOn: status === 'postponed' || status === 'shift' ? next : null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

export function missed(
  dueOn: string,
  next: string,
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  return dose(dueOn, next, { givenOn: null, status: 'missed', ...overrides })
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
  next: string,
  overrides: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  return dose(givenOn, next, { id: `en plus ${givenOn}`, status: 'extra', ...overrides })
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

export { plain } from '@/shared/__tests__/plain'
