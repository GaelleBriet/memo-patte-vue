import { describe, expect, it } from 'vitest'

import { startsTooFarBack } from '../logic/treatment-settings'
import type { TreatmentPeriodSettings } from '../schema/treatment-period.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'

const AT = '2026-01-01T08:00:00.000Z'

const openSince1981 = {
  periods: [
    {
      id: 'p-1',
      treatmentId: 't-1',
      animalId: 'a-1',
      startsOn: '1981-01-13',
      firstDueOn: '1981-01-13',
      gridOriginOn: '1981-01-13',
      firstDueChosen: false,
      fallenDosesAnswer: 'unasked',
      endsOn: null,
      stoppedOn: null,
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '12:30', '20:00'],
      doseQuantity: null,
      doseUnit: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
      createdAt: AT,
      updatedAt: AT,
      deletedAt: null,
      settingsWrittenAt: AT,
      gridWrittenAt: AT,
      gridBefore: null,
    },
  ],
  doses: [],
} as unknown as Pick<TreatmentWithPeriods, 'periods' | 'doses'>

const newSettings: TreatmentPeriodSettings = {
  startsOn: '2022-11-13',
  firstDueOn: '2022-11-13',
  frequency: { value: 20, unit: 'week' },
  times: ['08:00', '12:30'],
  doseQuantity: null,
  doseUnit: null,
  endsOn: null,
  reminderOffsetMinutes: null,
  reminderTime: null,
}

describe('startsTooFarBack', () => {
  it('refuse quand le carnet existant est illisible, même si la nouvelle période le rendrait lisible', () => {
    expect(startsTooFarBack(openSince1981, newSettings, '2026-10-05')).toBe(true)
  })

  it('accepte une première prise récente sur un carnet vide', () => {
    expect(startsTooFarBack({ periods: [], doses: [] }, newSettings, '2026-10-05')).toBe(false)
  })
})
