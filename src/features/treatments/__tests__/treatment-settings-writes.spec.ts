import { describe, expect, it } from 'vitest'

import { settingsPlanOf } from '../logic/treatment-settings-writes'
import type { TreatmentPeriodSettings } from '../schema/treatment-period.schema'

const SETTINGS: TreatmentPeriodSettings = {
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-03',
  endsOn: '2026-10-20',
  frequency: { value: 2, unit: 'day' },
  times: ['08:00', '20:00'],
  doseQuantity: 1,
  doseUnit: 'tablet',
  reminderOffsetMinutes: 60,
  reminderTime: null,
}

const ORIGIN = {
  gridOriginOn: '2026-10-03',
  firstDueChosen: true,
  fallenDosesAnswer: 'stay-unlogged' as const,
}

const CALENDAR = {
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-03',
  gridOriginOn: '2026-10-03',
  firstDueChosen: true,
  fallenDosesAnswer: 'stay-unlogged',
  endsOn: '2026-10-20',
  frequency: { value: 2, unit: 'day' },
  times: ['08:00', '20:00'],
}

describe('settingsPlanOf — le réglage que pose l’écriture de la période', () => {
  it('une période ouverte crée un réglage, avec ce qui fait son calendrier', () => {
    expect(
      settingsPlanOf({ action: 'open', id: 'periode-milo', settings: SETTINGS, ...ORIGIN }),
    ).toEqual({ action: 'create', setting: CALENDAR })
  })

  it('une période corrigée réécrit le réglage du même identifiant', () => {
    expect(
      settingsPlanOf({ action: 'correct', id: 'periode-luna', settings: SETTINGS, ...ORIGIN }),
    ).toEqual({ action: 'rewrite', id: 'periode-luna', setting: CALENDAR })
  })
})
