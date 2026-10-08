import { describe, expect, it } from 'vitest'

import { isStoppedBeforeFirstDose, periodClosedBeforeFirstDue } from '../domain/treatment-end'
import type { Due, DoseStatus, TreatmentPeriodInput } from '../domain/treatment-schedule'

type Period = Pick<
  TreatmentPeriodInput,
  'id' | 'startsOn' | 'createdAt' | 'firstDueOn' | 'endsOn' | 'stoppedOn'
>

const period: Period = {
  id: 'p-1',
  startsOn: '2026-10-07',
  createdAt: '2026-10-05T08:00:00.000Z',
  firstDueOn: '2026-10-07',
  endsOn: null,
  stoppedOn: '2026-10-06',
}

function lines(...statuses: DoseStatus[]) {
  return statuses.map((status) => ({ status }))
}

function alone(current: Period, doses = lines(), unloggedDoses: Due[] = []) {
  return isStoppedBeforeFirstDose(current, [current], { doses, unloggedDoses })
}

describe('periodClosedBeforeFirstDue', () => {
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

describe('isStoppedBeforeFirstDose', () => {
  it('vrai pour un arrêt avant la première échéance, sans aucune prise', () => {
    expect(alone(period)).toBe(true)
    expect(alone(period, lines('postponed', 'shift'))).toBe(true)
  })

  it('faux le jour même de la première échéance, après, ou sans arrêt', () => {
    expect(alone({ ...period, stoppedOn: '2026-10-07' })).toBe(false)
    expect(alone({ ...period, stoppedOn: '2026-10-08' })).toBe(false)
    expect(alone({ ...period, stoppedOn: null })).toBe(false)
  })

  it('faux dès qu’une dose a été donnée, oubliée ou prise en plus sur le traitement', () => {
    for (const status of ['given', 'missed', 'extra'] as const) {
      expect(alone(period, lines(status))).toBe(false)
    }
  })

  it('faux quand le moteur compte une dose due non renseignée, avancée avant l’arrêt', () => {
    const advanced: Due = { periodId: 'p-1', dueOn: '2026-10-05', dueTime: null }

    expect(alone(period, lines('postponed'), [advanced])).toBe(false)
  })

  it('faux quand une période précédente a eu des doses dues, même jamais renseignées', () => {
    const first: Period = {
      ...period,
      startsOn: '2026-09-01',
      firstDueOn: '2026-09-01',
      stoppedOn: '2026-09-05',
      createdAt: '2026-09-01T08:00:00.000Z',
    }
    const resumed: Period = {
      ...period,
      id: 'p-2',
      startsOn: '2026-10-08',
      firstDueOn: '2026-10-11',
      stoppedOn: '2026-10-08',
    }

    expect(
      isStoppedBeforeFirstDose(resumed, [first, resumed], { doses: [], unloggedDoses: [] }),
    ).toBe(false)
  })

  it('vrai quand chaque période s’est close avant sa première échéance', () => {
    const replaced: Period = {
      ...period,
      startsOn: '2026-09-01',
      firstDueOn: '2026-09-10',
      stoppedOn: null,
      createdAt: '2026-09-01T08:00:00.000Z',
    }
    const next: Period = {
      ...period,
      id: 'p-2',
      startsOn: '2026-09-05',
      firstDueOn: '2026-09-20',
      stoppedOn: '2026-09-12',
    }

    expect(isStoppedBeforeFirstDose(next, [replaced, next], { doses: [], unloggedDoses: [] })).toBe(
      true,
    )
  })
})
