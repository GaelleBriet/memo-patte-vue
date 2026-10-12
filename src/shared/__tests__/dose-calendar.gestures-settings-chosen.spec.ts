// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { moveDose, newSettings, preview, type SettingsRequest } from '../domain/dose-calendar'
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

describe('#796, R6, R7 : la date choisie emmène le décalage de la journée du report, comme « Prochaine dose »', () => {
  const metacam = setting('p1', '2026-10-02', TWO_DAYS)
  const report = line('p1', 'postponed', '2026-10-08', null, '2026-10-10')
  const shift = line('p1', 'shift', '2026-10-08', null, '2026-10-10')
  const lines = [
    line('p1', 'given', '2026-10-02'),
    line('p1', 'given', '2026-10-04'),
    line('p1', 'given', '2026-10-06'),
    report,
    shift,
  ]
  const asked = (firstDueOn: string): SettingsRequest => ({
    frequency: TWO_DAYS,
    times: [],
    endsOn: null,
    firstDueOn,
  })

  it('Métacam tous les 2 jours du 2 oct., dose du 8 reportée au 10 avec « Décaler aussi » ; le 8, posologie et « Prochaine dose » le 8 : 8, 10, 12', () => {
    const input = { settings: [metacam], lines, today: '2026-10-08' }
    expect(planOf(input, asked('2026-10-08')).lines).toEqual([
      { action: 'delete', id: report.id },
      { action: 'delete', id: shift.id },
    ])
    expect(shown(input, asked('2026-10-08'))).toEqual(['2026-10-08', '2026-10-10', '2026-10-12'])
  })

  it('même carnet, le 9, « Prochaine dose » le 11 : le décalage est réécrit au 11 avec le report, 11, 13', () => {
    const input = { settings: [metacam], lines, today: '2026-10-09' }
    const plan = planOf(input, asked('2026-10-11'))
    expect(plan.lines).toEqual([
      {
        action: 'rewrite',
        id: report.id,
        line: expect.objectContaining({ targetOn: '2026-10-11' }),
      },
      {
        action: 'rewrite',
        id: shift.id,
        line: expect.objectContaining({ targetOn: '2026-10-11' }),
      },
    ])
    expect(shown(input, asked('2026-10-11'), 2)).toEqual(['2026-10-11', '2026-10-13'])
    expect(
      preview(input, plan).history.find(({ line: { id } }) => id === shift.id)?.effect,
    ).toEqual({ kind: 'shifts', from: '2026-10-08' })
  })

  it('les lignes écrites sont celles de « Prochaine dose » avec « Décaler aussi » sur la dose du 10', () => {
    const input = { settings: [metacam], lines, today: '2026-10-09' }
    const moved = moveDose(input, {
      due: { settingId: 'p1', dueOn: '2026-10-10', dueTime: null },
      to: '2026-10-11',
      shiftsFollowing: true,
    })
    expect('changes' in moved && moved.changes).toEqual(planOf(input, asked('2026-10-11')).lines)
  })
})

describe('Q38, R12 : la date proposée, passée telle quelle, n’est pas une date choisie', () => {
  it('toutes les 6 semaines du 7 mars, 7 mars donné, dose du 18 avr. avancée au 11 ; le 8 mars, fin le 20 mars : la date proposée (le 8) passée telle quelle, le report garde son arrivée', () => {
    const sixWeeks = { value: 6, unit: 'week' as const }
    const input = {
      settings: [setting('s1', '2026-03-07', sixWeeks)],
      lines: [
        line('s1', 'given', '2026-03-07'),
        line('s1', 'postponed', '2026-04-18', null, '2026-04-11'),
      ],
      today: '2026-03-08',
    }
    const asked = { frequency: sixWeeks, times: [], endsOn: '2026-03-20' }
    expect(planOf(input, asked).setting.firstDueOn).toBe('2026-03-08')
    expect(planOf(input, { ...asked, firstDueOn: '2026-03-08' }).lines).toBeUndefined()
  })
})

describe('#796 : une date choisie avant une dose déjà notée plus loin ne réécrit aucun report', () => {
  it('graine 540000188 : mensuel à 6, 12, 18 et 23 h, dose du 4 mai à 6 h donnée le 18 mars, 12 h reportée au 17 mai ; le 19, « Prochaine dose » le 22 mars : le report garde son arrivée', () => {
    const monthly = { value: 1, unit: 'month' as const }
    const H4 = ['06:00', '12:00', '18:00', '23:00']
    const s1 = setting('s1', '2026-03-04', monthly, ['08:00', '20:00'])
    const s2 = setting('s2', '2026-03-27', monthly, H4, {
      startsOn: '2026-03-19',
      gridOriginOn: null,
    })
    const ahead = (settingId: string, dueOn: string, dueTime: string, givenOn: string) => ({
      ...line(settingId, 'given', dueOn, dueTime),
      givenOn,
    })
    const input = {
      settings: [s1, s2],
      lines: [
        ahead('s1', '2026-03-04', '20:00', '2026-03-14'),
        line('s1', 'postponed', '2026-03-04', '08:00', '2026-03-27'),
        ahead('s1', '2026-03-27', '08:00', '2026-03-11'),
        ahead('s1', '2026-04-04', '08:00', '2026-03-10'),
        ahead('s1', '2026-04-04', '20:00', '2026-03-16'),
        ahead('s2', '2026-04-04', '06:00', '2026-03-19'),
        ahead('s2', '2026-05-04', '06:00', '2026-03-18'),
        ahead('s2', '2026-04-04', '18:00', '2026-03-18'),
        line('s2', 'postponed', '2026-05-04', '12:00', '2026-05-17'),
        line('s2', 'shift', '2026-05-04', '12:00', '2026-05-17'),
      ],
      today: '2026-03-19',
    }
    const asked = { frequency: monthly, times: H4, endsOn: null, firstDueOn: '2026-03-22' }
    expect(planOf(input, asked).lines).toBeUndefined()
  })
})
