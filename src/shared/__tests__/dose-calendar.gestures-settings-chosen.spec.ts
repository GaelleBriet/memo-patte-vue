// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  chosenDateRefusal,
  moveDose,
  newSettings,
  preview,
  type SettingsRequest,
} from '../domain/dose-calendar'
import type { TreatmentViewInput } from '../domain/dose-calendar/types'
import { DAY, keys, line, next, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

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

describe('#796, Q26 : une date choisie avant une dose déjà notée plus loin est refusée, aucun report réécrit (décision du 2026-10-13)', () => {
  it('graine 540000188 : mensuel à 6, 12, 18 et 23 h, dose du 4 mai à 6 h donnée le 18 mars, 12 h reportée au 17 mai ; le 19, « Prochaine dose » le 22 mars : refusée', () => {
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
    expect(newSettings(input, asked)).toEqual({ refusal: { reason: 'later-dose' } })
  })
})

describe('R9, R6, TR-9 : une date choisie déplace la dose du moment, le report plus loin suit la grille ou devient sans effet (décision du 2026-10-13)', () => {
  const metacam = setting('p1', '2026-10-02', TWO_DAYS)
  const report = line('p1', 'postponed', '2026-10-08', null, '2026-10-10')
  const lines = [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-04'), report]
  const asked = (firstDueOn: string): SettingsRequest => ({
    frequency: TWO_DAYS,
    times: [],
    endsOn: null,
    firstDueOn,
  })
  const effectOfReport = (input: TreatmentViewInput, plan: ReturnType<typeof planOf>) =>
    preview(input, plan).history.find(({ line: { id } }) => id === report.id)?.effect

  it('cas A : tous les 2 jours, doses des 2 et 4 données, 6 non donnée, 8 reportée au 10 ; le 7, posologie et « Prochaine dose » le 9 : 9, 11, 13, le 9 remplace la dose en retard du 6', () => {
    const input = { settings: [metacam], lines, today: '2026-10-07' }
    const plan = planOf(input, asked('2026-10-09'))
    expect(plan.lines).toBeUndefined()
    expect(shown(input, asked('2026-10-09'))).toEqual(['2026-10-09', '2026-10-11', '2026-10-13'])
    expect(keys(preview(input, plan).unloggedDoses)).toEqual([])
    expect(effectOfReport(input, plan)).toMatchObject({ kind: 'idle' })
  })

  it('cas B : même carnet, le 6, dose du jour en attente ; « Prochaine dose » le 7 : 7, 9, 11, le report du 8 est sans effet', () => {
    const input = { settings: [metacam], lines, today: '2026-10-06' }
    const plan = planOf(input, asked('2026-10-07'))
    expect(plan.lines).toBeUndefined()
    expect(shown(input, asked('2026-10-07'))).toEqual(['2026-10-07', '2026-10-09', '2026-10-11'])
    expect(effectOfReport(input, plan)).toMatchObject({ kind: 'idle' })
  })

  it('cas B, puis le 7 dose donnée et posologie seule : la grille repartie reste, le report reste sans effet', () => {
    const input = { settings: [metacam], lines, today: '2026-10-06' }
    expect(planOf(input, asked('2026-10-07')).setting).toMatchObject({
      startsOn: '2026-10-06',
      firstDueOn: '2026-10-07',
      gridOriginOn: '2026-10-07',
    })
    const chosen = setting('p2', '2026-10-07', TWO_DAYS, [], { startsOn: '2026-10-06' })
    const after = {
      settings: [metacam, chosen],
      lines: [...lines, line('p2', 'given', '2026-10-07')],
      today: '2026-10-07',
    }
    const plan = planOf(after, { frequency: TWO_DAYS, times: [], endsOn: null })
    expect(shown(after, { frequency: TWO_DAYS, times: [], endsOn: null })).toEqual([
      '2026-10-09',
      '2026-10-11',
      '2026-10-13',
    ])
    expect(effectOfReport(after, plan)).toMatchObject({ kind: 'idle' })
  })

  it('même carnet, le 6, « Prochaine dose » le 8 : le report part de la date choisie, elle le porte, il est sans effet : 8, 10, 12', () => {
    const input = { settings: [metacam], lines, today: '2026-10-06' }
    const plan = planOf(input, asked('2026-10-08'))
    expect(shown(input, asked('2026-10-08'))).toEqual(['2026-10-08', '2026-10-10', '2026-10-12'])
    expect(effectOfReport(input, plan)).toMatchObject({ kind: 'idle' })
  })

  it('même carnet, le 7, posologie et « Prochaine dose » le 8 : 8, 10, 12, le report du 8 est sans effet, comme sur main', () => {
    const input = { settings: [metacam], lines, today: '2026-10-07' }
    const plan = planOf(input, asked('2026-10-08'))
    expect(shown(input, asked('2026-10-08'))).toEqual(['2026-10-08', '2026-10-10', '2026-10-12'])
    expect(effectOfReport(input, plan)).toMatchObject({ kind: 'idle' })
  })

  it('date choisie le 8, puis le 8, dose du jour reportée au 9 : ce report-là garde son effet, 9, 10, 12', () => {
    const chosen = setting('p2', '2026-10-08', TWO_DAYS, [], { startsOn: '2026-10-07' })
    const later = line('p2', 'postponed', '2026-10-08', null, '2026-10-09')
    expect(next([metacam, chosen], [...lines, later], '2026-10-08')).toEqual([
      '2026-10-09',
      '2026-10-10',
      '2026-10-12',
    ])
  })
})

describe('Q26, R12 : une dose plus lointaine déjà notée refuse la « Prochaine dose » choisie, réglage changé compris (décision du 2026-10-13)', () => {
  const daily = setting('d1', '2026-04-15', DAY)
  const ahead = { ...line('d1', 'given', '2026-05-19'), givenOn: '2026-04-20' }
  const input = {
    settings: [daily],
    lines: [line('d1', 'given', '2026-04-15'), ahead],
    today: '2026-04-24',
  }
  const asked = { frequency: DAY, times: [], endsOn: null }

  it('tous les jours, dose du 19 mai donnée d’avance ; le 24 avr., posologie et « Prochaine dose » le 25 : refusé, « Une dose plus lointaine est déjà notée. »', () => {
    expect(newSettings(input, { ...asked, firstDueOn: '2026-04-25' })).toEqual({
      refusal: { reason: 'later-dose' },
    })
  })

  it('même carnet, heures passées à 8 h et « Prochaine dose » le 2 juin : refusé', () => {
    expect(newSettings(input, { ...asked, times: ['08:00'], firstDueOn: '2026-06-02' })).toEqual({
      refusal: { reason: 'later-dose' },
    })
  })

  it('même carnet, posologie seule sans toucher la date, ou la date proposée passée telle quelle : accepté', () => {
    expect(newSettings(input, asked)).toHaveProperty('plan')
    expect(newSettings(input, { ...asked, firstDueOn: '2026-04-24' })).toEqual(
      newSettings(input, asked),
    )
  })

  it('le refus se lit sans date, pour griser le champ', () => {
    expect(chosenDateRefusal(input, newSettings(input, asked))).toEqual({ reason: 'later-dose' })
    const without = { ...input, lines: [line('d1', 'given', '2026-04-15')] }
    expect(chosenDateRefusal(without, newSettings(without, asked))).toBeNull()
  })

  it('G24, #711 : la dose du lendemain à 8 h donnée d’avance est la prochaine dose, pas une dose plus lointaine : le champ reste libre', () => {
    const twice = setting('t1', '2026-10-01', TWO_DAYS, ['08:00', '20:00'])
    const carnet = {
      settings: [twice],
      lines: [
        line('t1', 'given', '2026-10-01', '08:00'),
        line('t1', 'given', '2026-10-01', '20:00'),
        { ...line('t1', 'given', '2026-10-03', '08:00'), givenOn: '2026-10-02' },
      ],
      today: '2026-10-02',
    }
    const changed = { frequency: TWO_DAYS, times: ['09:00', '21:00'], endsOn: null }
    expect(chosenDateRefusal(carnet, newSettings(carnet, changed))).toBeNull()
  })
})
