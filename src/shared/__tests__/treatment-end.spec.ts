import { describe, expect, it } from 'vitest'

import { isStoppedBeforeFirstDose } from '../domain/treatment-end'
import type { DoseStatus } from '../domain/treatment-schedule'

const period = { firstDueOn: '2026-10-07', stoppedOn: '2026-10-06' }

function lines(...statuses: DoseStatus[]) {
  return statuses.map((status) => ({ status }))
}

describe('isStoppedBeforeFirstDose', () => {
  it('vrai pour un arrêt avant la première échéance, sans aucune prise', () => {
    expect(isStoppedBeforeFirstDose(period, [])).toBe(true)
    expect(isStoppedBeforeFirstDose(period, lines('postponed', 'shift'))).toBe(true)
  })

  it('faux le jour même de la première échéance, après, ou sans arrêt', () => {
    expect(isStoppedBeforeFirstDose({ ...period, stoppedOn: '2026-10-07' }, [])).toBe(false)
    expect(isStoppedBeforeFirstDose({ ...period, stoppedOn: '2026-10-08' }, [])).toBe(false)
    expect(isStoppedBeforeFirstDose({ ...period, stoppedOn: null }, [])).toBe(false)
  })

  it('faux dès qu’une dose a été donnée, oubliée ou prise en plus sur le traitement', () => {
    for (const status of ['given', 'missed', 'extra'] as const) {
      expect(isStoppedBeforeFirstDose(period, lines(status))).toBe(false)
    }
  })
})
