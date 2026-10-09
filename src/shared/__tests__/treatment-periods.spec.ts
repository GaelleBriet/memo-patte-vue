import { describe, expect, it } from 'vitest'

import { hasSeveralDoseTimes, isSeveralTimesADay } from '../domain/treatment-periods'

describe('isSeveralTimesADay', () => {
  it('ne vaut que pour une période à plus d’une heure de prise', () => {
    expect(isSeveralTimesADay({ times: [] })).toBe(false)
    expect(isSeveralTimesADay({ times: ['08:00'] })).toBe(false)
    expect(isSeveralTimesADay({ times: ['08:00', '20:00'] })).toBe(true)
  })
})

describe('hasSeveralDoseTimes', () => {
  it('ne vaut que pour plus d’une heure saisie', () => {
    expect(hasSeveralDoseTimes([])).toBe(false)
    expect(hasSeveralDoseTimes(['08:00'])).toBe(false)
    expect(hasSeveralDoseTimes(['08:00', '20:00'])).toBe(true)
  })
})
