// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { keptCorrection } from '../domain/dose-calendar/gestures/settings-kept'
import type { Dates } from '../domain/dose-calendar/gestures/settings-proposal'
import type { SettingsPlan, TreatmentViewInput } from '../domain/dose-calendar/types'
import { line, setting, TWO_DAYS } from './dose-calendar.v2.aides'

describe('TR-28, Q38 : corrigé à fréquence gardée, le réglage garde sa grille', () => {
  const s1 = setting('s1', '2026-04-01', TWO_DAYS, ['08:00'])
  const s2 = setting('s2', '2026-04-03', TWO_DAYS, ['09:00'], { startsOn: '2026-04-02' })
  const input: TreatmentViewInput = {
    settings: [s1, s2],
    lines: [line('s1', 'given', '2026-04-01', '08:00')],
    today: '2026-04-06',
  }
  const request = { frequency: TWO_DAYS, times: ['10:00'], endsOn: null }
  const draft = (dates: Dates): SettingsPlan => ({
    action: 'rewrite',
    id: 's2',
    setting: { ...s2, ...dates, times: ['10:00'] },
  })

  it('tous les 2 jours dès le 3 avril, 9 h sans prise ; le 6, 10 h : il part du 7, sur sa grille', () => {
    expect(keptCorrection(input, s2, request, draft)).toEqual({
      firstDueOn: '2026-04-07',
      gridOriginOn: '2026-04-03',
      firstDueChosen: true,
    })
  })
})
