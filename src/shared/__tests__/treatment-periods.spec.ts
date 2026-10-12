import { describe, expect, it } from 'vitest'

import {
  hasSeveralDoseTimes,
  isSeveralTimesADay,
  periodClosedBeforeFirstDue,
} from '../domain/treatment-periods'

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

describe('periodClosedBeforeFirstDue', () => {
  const period = { firstDueOn: '2026-10-07', endsOn: null, stoppedOn: '2026-10-06' }

  it('vrai pour une période arrêtée avant sa première échéance', () => {
    expect(periodClosedBeforeFirstDue(period, undefined)).toBe(true)
    expect(periodClosedBeforeFirstDue({ ...period, stoppedOn: '2026-10-07' }, undefined)).toBe(
      false,
    )
    expect(periodClosedBeforeFirstDue({ ...period, stoppedOn: null }, undefined)).toBe(false)
  })

  it('vrai pour une période remplacée par la suivante avant sa première échéance', () => {
    const open = { ...period, stoppedOn: null }

    expect(periodClosedBeforeFirstDue(open, { startsOn: '2026-10-07' })).toBe(true)
    expect(periodClosedBeforeFirstDue(open, { startsOn: '2026-10-08' })).toBe(false)
  })
})
