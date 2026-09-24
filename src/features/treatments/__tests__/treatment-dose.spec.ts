import { describe, expect, it } from 'vitest'

import { doseGivenOn, nextDueAfterDose } from '../logic/treatment-dose'

const BRAVECTO = {
  id: '44444444-4444-4444-8444-444444444444',
  animalId: '11111111-1111-4111-8111-111111111111',
  frequency: { value: 1, unit: 'month' },
  lastDoseDate: '2026-08-28',
  nextDueDate: '2026-09-28',
} as const

describe('doseGivenOn', () => {
  it('fixe la prochaine dose depuis la date réelle de la prise, avec la fréquence du plan recopiée', () => {
    expect(
      doseGivenOn(BRAVECTO, '2026-09-20', { id: 'p1', at: '2026-09-24T08:00:00.000Z' }),
    ).toEqual({
      id: 'p1',
      treatmentId: BRAVECTO.id,
      animalId: BRAVECTO.animalId,
      givenOn: '2026-09-20',
      nextDueDate: '2026-10-20',
      frequency: { value: 1, unit: 'month' },
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
      deletedAt: null,
    })
  })
})

describe('nextDueAfterDose', () => {
  it('recalcule la prochaine dose d’une prise plus récente que la dernière', () => {
    expect(nextDueAfterDose(BRAVECTO, '2026-09-23')).toBe('2026-10-23')
  })

  it('garde la prochaine dose quand la prise est plus ancienne ou du même jour que la dernière', () => {
    expect(nextDueAfterDose(BRAVECTO, '2026-08-01')).toBe('2026-09-28')
    expect(nextDueAfterDose(BRAVECTO, '2026-08-28')).toBe('2026-09-28')
  })
})
