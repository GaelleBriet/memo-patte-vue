// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, preview, type SettingsRequest } from '../domain/dose-calendar'
import type { TreatmentViewInput } from '../domain/dose-calendar/types'
import { keys, line, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

function planOf(input: TreatmentViewInput, asked: SettingsRequest) {
  const result = newSettings(input, asked)
  if (!('plan' in result)) throw new Error(`pas de plan : ${JSON.stringify(result)}`)
  return result.plan
}

function shown(input: TreatmentViewInput, asked: SettingsRequest, count = 3) {
  const view = preview(input, planOf(input, asked))
  return [...new Set(keys([...view.currentDoses, ...view.upcoming()]))].slice(0, count)
}

describe('#796, R9, R7 : une date choisie déplace la prochaine dose, arrivée d’un report comprise (décision du 2026-10-12)', () => {
  const metacam = setting('p1', '2026-10-02', TWO_DAYS)
  const report = line('p1', 'postponed', '2026-10-08', null, '2026-10-10')
  const lines = [
    line('p1', 'given', '2026-10-02'),
    line('p1', 'given', '2026-10-04'),
    line('p1', 'given', '2026-10-06'),
    report,
  ]
  const asked = (firstDueOn: string): SettingsRequest => ({
    frequency: TWO_DAYS,
    times: [],
    endsOn: null,
    firstDueOn,
  })

  it('tous les 2 jours du 2 oct., dose du 8 reportée seule au 10 ; le 9, « Prochaine dose » le 11 : 11, 13', () => {
    const input = { settings: [metacam], lines, today: '2026-10-09' }
    expect(shown(input, asked('2026-10-11'))).toEqual(['2026-10-11', '2026-10-13', '2026-10-15'])
  })

  it('même carnet, le 8, « Prochaine dose » le 9 : 9, 11', () => {
    const input = { settings: [metacam], lines, today: '2026-10-08' }
    expect(shown(input, asked('2026-10-09'), 2)).toEqual(['2026-10-09', '2026-10-11'])
  })

  it('la ligne de report est réécrite pour arriver à la date choisie, elle n’est pas « sans effet »', () => {
    const input = { settings: [metacam], lines, today: '2026-10-09' }
    const plan = planOf(input, asked('2026-10-11'))
    expect(plan.lines).toEqual([
      {
        action: 'rewrite',
        id: report.id,
        line: expect.objectContaining({ targetOn: '2026-10-11' }),
      },
    ])
    expect(
      preview(input, plan).history.find(({ line: { id } }) => id === report.id)?.effect,
    ).toMatchObject({ kind: 'moves', keys: ['2026-10-08'], arrival: '2026-10-11' })
  })

  it('la date choisie ramenée au jour d’origine du report supprime sa ligne (R7)', () => {
    const input = { settings: [metacam], lines, today: '2026-10-08' }
    expect(planOf(input, asked('2026-10-08')).lines).toEqual([{ action: 'delete', id: report.id }])
  })

  it('le jour de l’arrivée choisi tel quel : rien n’est réécrit', () => {
    const input = { settings: [metacam], lines, today: '2026-10-09' }
    expect(planOf(input, asked('2026-10-10')).lines ?? []).toEqual([])
  })

  it('fréquence changée, date choisie après l’arrivée : le report garde son arrivée (R9, à fréquence gardée seulement)', () => {
    const input = { settings: [metacam], lines, today: '2026-10-09' }
    const asked12 = { ...asked('2026-10-12'), frequency: WEEK }
    expect(planOf(input, asked12).lines).toBeUndefined()
    expect(shown(input, asked12)).toEqual(['2026-10-10', '2026-10-12', '2026-10-19'])
  })
})
