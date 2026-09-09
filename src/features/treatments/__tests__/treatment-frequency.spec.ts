import { describe, expect, it } from 'vitest'
import { addFrequency } from '../treatment-frequency'

describe('addFrequency', () => {
  it('ajoute des jours', () => {
    expect(addFrequency('2026-03-01', { value: 15, unit: 'day' })).toBe('2026-03-16')
  })

  it('ajoute des semaines : 4 semaines ne font pas un mois', () => {
    expect(addFrequency('2026-03-01', { value: 4, unit: 'week' })).toBe('2026-03-29')
    expect(addFrequency('2026-03-01', { value: 1, unit: 'month' })).toBe('2026-04-01')
  })

  it('ajoute des mois', () => {
    expect(addFrequency('2026-03-01', { value: 3, unit: 'month' })).toBe('2026-06-01')
    expect(addFrequency('2026-11-15', { value: 3, unit: 'month' })).toBe('2027-02-15')
  })

  it('cale le 31 janvier + 1 mois sur le dernier jour de février', () => {
    expect(addFrequency('2026-01-31', { value: 1, unit: 'month' })).toBe('2026-02-28')
    expect(addFrequency('2028-01-31', { value: 1, unit: 'month' })).toBe('2028-02-29')
  })

  it('franchit une fin d’année en jours', () => {
    expect(addFrequency('2026-12-20', { value: 15, unit: 'day' })).toBe('2027-01-04')
  })
})
