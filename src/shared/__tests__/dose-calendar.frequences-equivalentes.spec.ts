// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, preview, type SettingsRequest } from '../domain/dose-calendar'
import { sameFrequency } from '../domain/dose-calendar/grid'
import { sameFrequency as referenceSameFrequency } from '../domain/dose-calendar/reference-grid'
import type { Frequency, TreatmentViewInput } from '../domain/dose-calendar/types'
import type { ReferenceSetting } from '../domain/dose-calendar/reference-types'
import { keys, line, setting } from './dose-calendar.v2.aides'

const TWO_WEEKS: Frequency = { value: 2, unit: 'week' }
const FOURTEEN_DAYS: Frequency = { value: 14, unit: 'day' }
const WEEK: Frequency = { value: 1, unit: 'week' }
const SEVEN_DAYS: Frequency = { value: 7, unit: 'day' }
const MONTH: Frequency = { value: 1, unit: 'month' }
const THIRTY_DAYS: Frequency = { value: 30, unit: 'day' }
const FOUR_WEEKS: Frequency = { value: 4, unit: 'week' }

function nextDoses(input: TreatmentViewInput, frequency: Frequency): string[] {
  const asked: SettingsRequest = { frequency, times: [], endsOn: null }
  const result = newSettings(input, asked)
  if (!('plan' in result)) throw new Error(`pas de plan : ${JSON.stringify(result)}`)
  const view = preview(input, result.plan)
  return [...new Set(keys([...view.currentDoses, ...view.upcoming()]))].slice(0, 2)
}

// Toutes les 2 semaines depuis le 2 mars ; la dose du 16 reportée au 18 ; le 20, « Modifier ».
const reported = (frequency: Frequency): TreatmentViewInput => ({
  settings: [setting('s1', '2026-03-02', frequency)],
  lines: [line('s1', 'postponed', '2026-03-16', null, '2026-03-18')],
  today: '2026-03-20',
})

describe('#979 : semaines et jours se lisent sur la même suite de jours', () => {
  it.each<[string, Frequency, Frequency, boolean]>([
    ['2 semaines et 14 jours', TWO_WEEKS, FOURTEEN_DAYS, true],
    ['14 jours et 2 semaines', FOURTEEN_DAYS, TWO_WEEKS, true],
    ['1 semaine et 7 jours', WEEK, SEVEN_DAYS, true],
    ['2 semaines et 2 semaines', TWO_WEEKS, TWO_WEEKS, true],
    ['2 semaines et 15 jours', TWO_WEEKS, { value: 15, unit: 'day' }, false],
    ['1 mois et 30 jours', MONTH, THIRTY_DAYS, false],
    ['4 semaines et 1 mois', FOUR_WEEKS, MONTH, false],
    ['1 mois et 1 mois', MONTH, MONTH, true],
  ])('%s : même fréquence %s', (_, a, b, same) => {
    const of = (frequency: Frequency) => ({ frequency }) as ReferenceSetting

    expect(sameFrequency(a, b)).toBe(same)
    expect(referenceSameFrequency(of(a), of(b))).toBe(same)
  })

  it('2 semaines, le 16 mars reporté au 18 ; le 20, « Modifier » à 14 jours : le 18 en retard, puis le 30 mars', () => {
    expect(nextDoses(reported(TWO_WEEKS), FOURTEEN_DAYS)).toEqual(['2026-03-18', '2026-03-30'])
    expect(nextDoses(reported(TWO_WEEKS), TWO_WEEKS)).toEqual(['2026-03-18', '2026-03-30'])
  })

  it('14 jours, même report ; le 20, « Modifier » à 2 semaines : le 18 en retard, puis le 30 mars', () => {
    expect(nextDoses(reported(FOURTEEN_DAYS), TWO_WEEKS)).toEqual(['2026-03-18', '2026-03-30'])
  })

  it('chaque semaine depuis le 2 mars, le 9 reporté au 11 ; le 12, « Modifier » à 7 jours : le 16', () => {
    const input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-02', WEEK)],
      lines: [line('s1', 'postponed', '2026-03-09', null, '2026-03-11')],
      today: '2026-03-12',
    }

    expect(nextDoses(input, SEVEN_DAYS)).toEqual(nextDoses(input, WEEK))
  })
})
