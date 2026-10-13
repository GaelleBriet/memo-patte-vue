// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, preview, type SettingsRequest } from '../domain/dose-calendar'
import type { TreatmentViewInput } from '../domain/dose-calendar/types'
import { keys, line, setting, WEEK } from './dose-calendar.v2.aides'

function planOf(input: TreatmentViewInput, asked: SettingsRequest) {
  const result = newSettings(input, asked)
  if (!('plan' in result)) throw new Error(`pas de plan : ${JSON.stringify(result)}`)
  return result.plan
}

describe('R9, R12 : « Modifier » propose la première dose encore à donner (décision du 2026-10-12)', () => {
  const monday = setting('m1', '2026-10-05', WEEK, ['08:00'])
  const milo = {
    settings: [monday],
    lines: [
      line('m1', 'given', '2026-10-05', '08:00'),
      { ...line('m1', 'given', '2026-10-12', '08:00'), givenOn: '2026-10-07' },
    ],
    today: '2026-10-07',
  }

  it.each([
    ['posologie seule', ['08:00']],
    ['heures passées à 9 h', ['09:00']],
  ])(
    'Milo, chaque lundi à 8 h, dose du 5 donnée, celle du 12 donnée le 7 ; le 7, %s : le 19 proposé et montré, le 12 reste donné',
    (_, times) => {
      const asked: SettingsRequest = { frequency: WEEK, times, endsOn: null }
      const result = newSettings(milo, asked)
      if (!('plan' in result)) throw new Error(JSON.stringify(result))
      expect(result.shownOn).toBe('2026-10-19')
      const view = preview(milo, result.plan)
      expect(view.dueState({ dueOn: '2026-10-12', dueTime: times[0]! })).not.toBe('pending')
      expect(keys(view.currentDoses)).toEqual([`2026-10-19 ${times[0]}`])
      expect(newSettings(milo, { ...asked, firstDueOn: '2026-10-19' })).toEqual(result)
    },
  )
})

describe('#799, R9.3 : la première dose proposée ne dépend pas du jour de la correction (décision du 2026-10-12)', () => {
  const daily = setting('p1', '2026-09-30', { value: 1, unit: 'day' })
  const weekly = setting('p2', '2026-10-09', WEEK, [], { startsOn: '2026-10-02' })
  const given = ['2026-09-30', '2026-10-01', '2026-10-02'].map((day) => line('p1', 'given', day))
  const everyTwoWeeks: SettingsRequest = {
    frequency: { value: 2, unit: 'week' },
    times: [],
    endsOn: null,
  }

  it.each(['2026-10-02', '2026-10-03', '2026-10-05'])(
    'quotidien du 30 sept., doses des 30, 1er et 2 oct. données, hebdo ouvert le 2 ; le %s, toutes les 2 semaines : le 16',
    (today) => {
      const input = { settings: [daily, weekly], lines: given, today }
      expect(planOf(input, everyTwoWeeks).setting).toMatchObject({
        firstDueOn: '2026-10-16',
        gridOriginOn: '2026-10-16',
      })
    },
  )
})
