import { describe, expect, it } from 'vitest'

import { earliestOtherDate } from '../logic/vaccination-sheet'

describe('earliestOtherDate', () => {
  it('est le lendemain du jour donné, quel que soit le fuseau de l’appareil', () => {
    expect(earliestOtherDate('2026-10-23')).toBe('2026-10-24')
  })

  it('passe le changement de mois et d’année', () => {
    expect(earliestOtherDate('2026-10-31')).toBe('2026-11-01')
    expect(earliestOtherDate('2026-12-31')).toBe('2027-01-01')
  })
})
