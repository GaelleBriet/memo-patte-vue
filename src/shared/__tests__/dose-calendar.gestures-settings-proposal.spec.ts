// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, type SettingsRequest } from '../domain/dose-calendar'
import type { TreatmentViewInput } from '../domain/dose-calendar/types'
import { line, setting, TWO_DAYS } from './dose-calendar.v2.aides'

function planOf(input: TreatmentViewInput, asked: SettingsRequest) {
  const result = newSettings(input, asked)
  if (!('plan' in result)) throw new Error(`pas de plan : ${JSON.stringify(result)}`)
  return result.plan
}

describe('#787, TR-8, Q20 : un rythme qui ne laisse plus aucune dose avant la date de fin (décision du 2026-10-12)', () => {
  const everyTwo = setting('p1', '2026-10-01', TWO_DAYS, [], { endsOn: '2026-10-10' })
  const input = {
    settings: [everyTwo],
    lines: [line('p1', 'given', '2026-10-01'), line('p1', 'given', '2026-10-03')],
    today: '2026-10-04',
  }
  const monthly = (endsOn: string): SettingsRequest => ({
    frequency: { value: 1, unit: 'month' },
    times: [],
    endsOn,
  })

  it('tous les 2 jours du 1er oct., fin le 10, doses des 1er et 3 données ; le 4, mensuel : refusé à l’enregistrement', () => {
    expect(newSettings(input, monthly('2026-10-10'))).toEqual({
      refusal: { reason: 'no-dose-before-end' },
    })
    expect(newSettings(input, { ...monthly('2026-10-10'), firstDueOn: '2026-11-03' })).toEqual({
      refusal: { reason: 'no-dose-before-end' },
    })
  })

  it('même carnet, date de fin repoussée au 10 nov. : le 3 nov. est proposé', () => {
    expect(planOf(input, monthly('2026-11-10')).setting.firstDueOn).toBe('2026-11-03')
  })
})
