// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, preview, type SettingsRequest } from '../domain/dose-calendar'
import type { Frequency, Line, Setting, TreatmentViewInput } from '../domain/dose-calendar/types'
import { DAY, H, keys, line, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

const THREE_DAYS: Frequency = { value: 3, unit: 'day' }

function request(frequency: Frequency, times: string[] = [], firstDueOn?: string) {
  const asked: SettingsRequest = { frequency, times, endsOn: null }
  return firstDueOn === undefined ? asked : { ...asked, firstDueOn }
}

function planOf(input: TreatmentViewInput, asked: SettingsRequest) {
  const result = newSettings(input, asked)
  if (!('plan' in result)) throw new Error(`pas de plan : ${JSON.stringify(result)}`)
  return result.plan
}

function shown(input: TreatmentViewInput, asked: SettingsRequest, count = 3) {
  const view = preview(input, planOf(input, asked))
  return [...new Set(keys([...view.currentDoses, ...view.upcoming()]))].slice(0, count)
}

const given = (
  settingId: string,
  dueOn: string,
  dueTime: string | null,
  givenOn: string,
): Line => ({
  ...line(settingId, 'given', dueOn, dueTime),
  givenOn,
})

describe('R9 : où commence un réglage dont la fréquence change', () => {
  const weekly = setting('p1', '2026-09-01', WEEK)
  const lines = [line('p1', 'given', '2026-09-01'), line('p1', 'given', '2026-09-08')]

  it('R9.1, Q7 : hebdo, dernière prise le 8 sept., tous les 15 jours le 29 : le 29, d’où part la grille', () => {
    const input = { settings: [weekly], lines, today: '2026-09-29' }
    expect(planOf(input, request({ value: 15, unit: 'day' }))).toMatchObject({
      action: 'create',
      setting: { startsOn: '2026-09-29', firstDueOn: '2026-09-29', gridOriginOn: '2026-09-29' },
    })
  })

  it('R9.3, Q7 : la dernière journée qui a une prise plus la nouvelle fréquence (8 sept. noté le 10, le 17 tous les 10 jours : le 18)', () => {
    const late = [line('p1', 'given', '2026-09-01'), given('p1', '2026-09-08', null, '2026-09-10')]
    const input = { settings: [weekly], lines: late, today: '2026-09-17' }
    expect(planOf(input, request({ value: 10, unit: 'day' })).setting.firstDueOn).toBe('2026-09-18')
  })

  it('R9.3 : jamais avant aujourd’hui (le mercredi 30 sept., tous les 10 jours : le 30)', () => {
    const input = { settings: [weekly], lines, today: '2026-09-30' }
    expect(planOf(input, request({ value: 10, unit: 'day' })).setting.firstDueOn).toBe('2026-09-30')
  })

  describe('tous les 2 jours à 8 h et 20 h du 1er oct., doses du 1er données', () => {
    const metacam = setting('p1', '2026-10-01', TWO_DAYS, H)
    const first = [
      line('p1', 'given', '2026-10-01', '08:00'),
      line('p1', 'given', '2026-10-01', '20:00'),
    ]

    it('R9.2 : 8 h du 3 donnée le 2 ; le 2, tous les 3 jours : il reste 20 h le 3, puis le 6', () => {
      const input = {
        settings: [metacam],
        lines: [...first, given('p1', '2026-10-03', '08:00', '2026-10-02')],
        today: '2026-10-02',
      }
      expect(shown(input, request(THREE_DAYS, H))).toEqual([
        '2026-10-03 20:00',
        '2026-10-06 08:00',
        '2026-10-06 20:00',
      ])
    })

    it('R9.2 : 8 h du 3 donnée, 20 h reportée seule au 4 ; le 3, tous les 3 jours : 20 h le 4, puis le 7', () => {
      const input = {
        settings: [metacam],
        lines: [
          ...first,
          line('p1', 'given', '2026-10-03', '08:00'),
          line('p1', 'postponed', '2026-10-03', '20:00', '2026-10-04'),
        ],
        today: '2026-10-03',
      }
      expect(planOf(input, request(THREE_DAYS, H)).setting.firstDueOn).toBe('2026-10-04')
      expect(shown(input, request(THREE_DAYS, H))).toEqual([
        '2026-10-04 20:00',
        '2026-10-07 08:00',
        '2026-10-07 20:00',
      ])
    })

    it('R9.1 : rien noté le 3, journée reportée seule au 4 ; le 3, tous les 3 jours : le 3 est proposé', () => {
      const input = {
        settings: [metacam],
        lines: [...first, line('p1', 'postponed', '2026-10-03', '08:00', '2026-10-04')],
        today: '2026-10-03',
      }
      expect(planOf(input, request(THREE_DAYS, H)).setting.firstDueOn).toBe('2026-10-03')
    })
  })
})

describe('R9, R3, Q-retard : fréquence gardée', () => {
  const monday = setting('p1', '2026-10-05', WEEK)
  const input = {
    settings: [monday],
    lines: [line('p1', 'given', '2026-10-05')],
    today: '2026-10-14',
  }

  it('hebdo du lundi, dose du lundi 12 non donnée, posologie changée le mercredi 14 : le 12, origine héritée, toujours en retard', () => {
    const plan = planOf(input, request(WEEK))
    expect(plan).toMatchObject({
      action: 'create',
      setting: { startsOn: '2026-10-14', firstDueOn: '2026-10-12', gridOriginOn: null },
    })
    const view = preview(input, plan)
    expect([view.phase, keys(view.currentDoses), keys(view.unloggedDoses)]).toEqual([
      'overdue',
      ['2026-10-12'],
      [],
    ])
  })

  it('heures seules changées le 14 : le 12 reste en retard', () => {
    const view = preview(input, planOf(input, request(WEEK, ['09:00'])))
    expect([view.phase, keys(view.currentDoses)]).toEqual(['overdue', ['2026-10-12']])
  })

  it('fréquence changée le 14 : le 12 passe à renseigner', () => {
    const view = preview(input, planOf(input, request({ value: 2, unit: 'week' })))
    expect(keys(view.unloggedDoses)).toEqual(['2026-10-12'])
  })
})

describe('R9 : « Prochaine dose » choisie', () => {
  const daily = setting('p1', '2026-10-01', DAY)
  const input = {
    settings: [daily],
    lines: [line('p1', 'given', '2026-10-01')],
    today: '2026-10-02',
  }

  it('une autre date devient la première échéance et l’origine, même à fréquence gardée', () => {
    expect(planOf(input, request(TWO_DAYS, [], '2026-10-05')).setting).toMatchObject({
      firstDueOn: '2026-10-05',
      gridOriginOn: '2026-10-05',
    })
    expect(planOf(input, request(DAY, [], '2026-10-05')).setting).toMatchObject({
      firstDueOn: '2026-10-05',
      gridOriginOn: '2026-10-05',
    })
  })

  it('Q7 : une date avant aujourd’hui est refusée', () => {
    expect(newSettings(input, request(TWO_DAYS, [], '2026-10-01'))).toEqual({
      refusal: { reason: 'too-early', earliest: '2026-10-02' },
    })
  })
})

describe('R10 : un réglage ouvert aujourd’hui, encore sans prise, se remplace', () => {
  const metacam = setting('p1', '2026-10-01', TWO_DAYS, H)
  const lines = [
    line('p1', 'given', '2026-10-01', '08:00'),
    line('p1', 'given', '2026-10-01', '20:00'),
    line('p1', 'postponed', '2026-10-03', '08:00', '2026-10-04'),
  ]

  it('Q-#744 : journée du 3 reportée seule au 4 ; le 3, tous les 3 jours puis tous les 2 jours : 4, 5, 7', () => {
    const start = { settings: [metacam], lines, today: '2026-10-03' }
    const first = planOf(start, request(THREE_DAYS, H))
    const changed: Setting = {
      ...first.setting,
      id: 'p2',
      stoppedOn: null,
      createdAt: '2026-02-01T00:00:00.000Z',
    }
    const input = { ...start, settings: [metacam, changed] }
    const second = planOf(input, request(TWO_DAYS, H))
    expect(second).toMatchObject({
      action: 'rewrite',
      id: 'p2',
      setting: { startsOn: '2026-10-03', firstDueOn: '2026-10-04', gridOriginOn: null },
    })
    const view = preview(input, second)
    expect(
      [...new Set([...view.currentDoses, ...view.upcoming()].map(({ dueOn }) => dueOn))].slice(
        0,
        3,
      ),
    ).toEqual(['2026-10-04', '2026-10-05', '2026-10-07'])
  })

  it('#781 : posologie seule le jour même, le réglage remplacé garde ses dates : 12, 14, 28', () => {
    const weekly = setting('s1', '2026-10-01', WEEK)
    const fortnightly = setting('s2', '2026-10-14', { value: 2, unit: 'week' }, [], {
      startsOn: '2026-10-10',
    })
    const input = {
      settings: [weekly, fortnightly],
      lines: [
        line('s1', 'given', '2026-10-01'),
        line('s1', 'postponed', '2026-10-08', null, '2026-10-12'),
      ],
      today: '2026-10-10',
    }
    const plan = planOf(input, request({ value: 2, unit: 'week' }))
    expect(plan).toMatchObject({
      action: 'rewrite',
      id: 's2',
      setting: { firstDueOn: '2026-10-14', gridOriginOn: '2026-10-14' },
    })
    const view = preview(input, plan)
    expect([...new Set(keys([...view.currentDoses, ...view.upcoming()]))].slice(0, 3)).toEqual([
      '2026-10-12',
      '2026-10-14',
      '2026-10-28',
    ])
  })
})

describe('TR-28, Q38, Q39 : un réglage sans prise', () => {
  const twoDays = setting('p1', '2026-10-03', TWO_DAYS)

  it('Q38 : tous les 2 jours depuis le 3, rien noté, tous les 3 jours le 8 : la question, les 3, 5 et 7 tombés', () => {
    const input = { settings: [twoDays], lines: [], today: '2026-10-08' }
    const result = newSettings(input, request(THREE_DAYS))
    expect(result).toEqual({
      question: {
        fallen: [
          { settingId: 'p1', dueOn: '2026-10-03', dueTime: null },
          { settingId: 'p1', dueOn: '2026-10-05', dueTime: null },
          { settingId: 'p1', dueOn: '2026-10-07', dueTime: null },
        ],
        keep: {
          action: 'create',
          setting: expect.objectContaining({ startsOn: '2026-10-08', firstDueOn: '2026-10-08' }),
        },
        correct: {
          action: 'rewrite',
          id: 'p1',
          setting: expect.objectContaining({ startsOn: '2026-10-03', firstDueOn: '2026-10-08' }),
        },
      },
    })
    if (!('question' in result)) return
    expect(keys(preview(input, result.question.keep).unloggedDoses)).toEqual([
      '2026-10-03',
      '2026-10-05',
      '2026-10-07',
    ])
    expect(keys(preview(input, result.question.correct).unloggedDoses)).toEqual([])
  })

  it('posologie seule : pas de question, le réglage est corrigé, ses dates gardées', () => {
    const input = { settings: [twoDays], lines: [], today: '2026-10-08' }
    expect(newSettings(input, request(TWO_DAYS))).toEqual({
      plan: {
        action: 'rewrite',
        id: 'p1',
        setting: expect.objectContaining({ firstDueOn: '2026-10-03' }),
      },
    })
  })

  it('sans échéance tombée : pas de question, la première dose à venir est gardée', () => {
    const later = setting('p1', '2026-10-15', WEEK, [], { startsOn: '2026-10-01' })
    const input = { settings: [later], lines: [], today: '2026-10-05' }
    expect(newSettings(input, request(DAY))).toEqual({
      plan: {
        action: 'rewrite',
        id: 'p1',
        setting: expect.objectContaining({ startsOn: '2026-10-01', firstDueOn: '2026-10-15' }),
      },
    })
  })
})
