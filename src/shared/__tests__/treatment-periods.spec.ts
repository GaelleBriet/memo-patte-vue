import { describe, expect, it } from 'vitest'

import { isSeveralTimesADay } from '../domain/treatment-periods'

describe('isSeveralTimesADay', () => {
  it('ne vaut que pour une période à plus d’une heure de prise', () => {
    expect(isSeveralTimesADay({ times: [] })).toBe(false)
    expect(isSeveralTimesADay({ times: ['08:00'] })).toBe(false)
    expect(isSeveralTimesADay({ times: ['08:00', '20:00'] })).toBe(true)
  })
})
