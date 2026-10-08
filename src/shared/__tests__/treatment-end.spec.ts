import { describe, expect, it } from 'vitest'

import { isStoppedBeforeFirstDose, isStoppedBeforeItsFirstDue } from '../domain/treatment-end'
import type { DoseStatus, TreatmentPeriodInput } from '../domain/treatment-schedule'

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

function alone(current: Period, doses = lines()) {
  return isStoppedBeforeFirstDose(current, { periods: [current], doses })
}

describe('isStoppedBeforeItsFirstDue', () => {
  it('vrai seulement pour une période arrêtée avant sa première échéance', () => {
    expect(isStoppedBeforeItsFirstDue(period)).toBe(true)
    expect(isStoppedBeforeItsFirstDue({ ...period, stoppedOn: '2026-10-07' })).toBe(false)
    expect(isStoppedBeforeItsFirstDue({ ...period, stoppedOn: null })).toBe(false)
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

    expect(isStoppedBeforeFirstDose(resumed, { periods: [first, resumed], doses: [] })).toBe(false)
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

    expect(isStoppedBeforeFirstDose(next, { periods: [replaced, next], doses: [] })).toBe(true)
  })
})
