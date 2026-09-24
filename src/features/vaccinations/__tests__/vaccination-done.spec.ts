import { describe, expect, it } from 'vitest'

import { injectionOn, nextReminderDate } from '../logic/vaccination-done'

describe('nextReminderDate', () => {
  it('compte « Dans 1 an » et « Dans 3 ans » depuis la date d’injection', () => {
    expect(nextReminderDate('2026-09-23', { kind: 'oneYear' })).toBe('2027-09-23')
    expect(nextReminderDate('2026-09-23', { kind: 'threeYears' })).toBe('2029-09-23')
  })

  it('cale un 29 février sur le 28 les années non bissextiles', () => {
    expect(nextReminderDate('2028-02-29', { kind: 'oneYear' })).toBe('2029-02-28')
  })

  it('reprend l’autre date choisie, et aucune date pour « Pas de rappel »', () => {
    expect(nextReminderDate('2026-09-23', { kind: 'otherDate', date: '2027-03-15' })).toBe(
      '2027-03-15',
    )
    expect(nextReminderDate('2026-09-23', { kind: 'none' })).toBeNull()
  })
})

describe('injectionOn', () => {
  it('construit l’injection du vaccin avec le rappel choisi ce jour-là', () => {
    expect(
      injectionOn(
        { id: 'v1', animalId: 'a1' },
        { injectedOn: '2026-09-23', nextDueDate: null },
        { id: 'i1', at: '2026-09-24T08:00:00.000Z' },
      ),
    ).toEqual({
      id: 'i1',
      vaccinationId: 'v1',
      animalId: 'a1',
      injectedOn: '2026-09-23',
      nextDueDate: null,
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
      deletedAt: null,
    })
  })
})
