import { describe, expect, it } from 'vitest'

import {
  hasSeveralDoseTimes,
  isSeveralTimesADay,
  periodClosedBeforeFirstDue,
  periodShownDays,
  periodShownRange,
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

describe('periodShownDays (R12, #925)', () => {
  const first = {
    id: 'p1',
    createdAt: '2026-10-03T08:00:00.000Z',
    startsOn: '2026-10-03',
    firstDueOn: '2026-10-03',
    endsOn: null,
    stoppedOn: '2026-10-17',
  }
  const resumed = {
    id: 'p2',
    createdAt: '2026-10-17T08:00:00.000Z',
    startsOn: '2026-10-17',
    firstDueOn: '2026-10-18',
    endsOn: null,
    stoppedOn: null,
  }

  it('une reprise après un arrêt commence à sa première échéance, la période arrêtée finit à son arrêt', () => {
    const periods = [first, resumed]
    expect(periodShownDays(periods, resumed)).toEqual({ start: '2026-10-18', lastDay: null })
    expect(periodShownDays(periods, first)).toEqual({ start: '2026-10-03', lastDay: '2026-10-17' })
  })

  it('une reprise après une fin commence aussi à sa première échéance', () => {
    const ended = { ...first, endsOn: '2026-10-10', stoppedOn: null }
    expect(periodShownDays([ended, resumed], resumed).start).toBe('2026-10-18')
  })

  it('une période ouverte par « Modifier » garde le jour du geste', () => {
    const running = { ...first, stoppedOn: null }
    const modified = { ...resumed, firstDueOn: '2026-10-24' }
    expect(periodShownDays([running, modified], modified).start).toBe('2026-10-17')
    expect(periodShownDays([running, modified], running).lastDay).toBe('2026-10-16')
  })
})

describe('periodShownRange (R12, #1007, #1421)', () => {
  const daily = {
    id: 'p1',
    createdAt: '2026-10-26T08:00:00.000Z',
    startsOn: '2026-10-26',
    firstDueOn: '2026-10-26',
    endsOn: null,
    stoppedOn: null,
  }
  const fortnightly = {
    id: 'p2',
    createdAt: '2026-10-28T10:05:00.000Z',
    startsOn: '2026-10-28',
    firstDueOn: '2026-11-07',
    endsOn: null,
    stoppedOn: null,
  }
  const periods = [daily, fortnightly]

  it('repousse la fin jusqu’à l’échéance de la dernière ligne de la période, report compris', () => {
    const lines = [
      { status: 'given', dueOn: '2026-10-27' },
      { status: 'postponed', dueOn: '2026-10-28' },
    ] as const

    expect(periodShownRange(periods, daily, lines)).toEqual({
      start: '2026-10-26',
      lastDay: '2026-10-28',
    })
  })

  it('ni un décalage ni une réponse « pas à donner » ne la repoussent', () => {
    const lines = [
      { status: 'given', dueOn: '2026-10-27' },
      { status: 'shift', dueOn: '2026-10-28' },
      { status: 'not-due', dueOn: '2026-10-29' },
    ] as const

    expect(periodShownRange(periods, daily, lines).lastDay).toBe('2026-10-27')
  })

  it('Q85 : ne dépasse jamais l’arrêt ni la date de fin de la période', () => {
    const advance = [{ status: 'given', dueOn: '2026-11-30' }] as const
    const stopped = { ...daily, stoppedOn: '2026-10-27' }
    const ended = { ...daily, endsOn: '2026-10-29' }

    expect(periodShownRange([stopped], stopped, advance).lastDay).toBe('2026-10-27')
    expect(periodShownRange([ended, fortnightly], ended, advance).lastDay).toBe('2026-10-29')
    expect(periodShownRange([stopped, fortnightly], stopped, advance).lastDay).toBe('2026-10-27')
  })

  it('une période ouverte reste ouverte', () => {
    expect(
      periodShownRange(periods, fortnightly, [{ status: 'given', dueOn: '2026-11-07' }]),
    ).toEqual({ start: '2026-10-28', lastDay: null })
  })
})
