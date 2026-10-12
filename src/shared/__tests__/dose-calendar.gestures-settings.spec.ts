// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, preview, type SettingsRequest } from '../domain/dose-calendar'
import type { Frequency, Line, Setting, TreatmentViewInput } from '../domain/dose-calendar/types'
import { DAY, H, keys, line, next, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

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

    it('R9.2, Q-#744 : rien noté le 3, journée reportée seule au 4 ; le 3, tous les 3 jours : le 4, d’où part le rythme', () => {
      const input = {
        settings: [metacam],
        lines: [...first, line('p1', 'postponed', '2026-10-03', '08:00', '2026-10-04')],
        today: '2026-10-03',
      }
      expect(planOf(input, request(THREE_DAYS, H)).setting.firstDueOn).toBe('2026-10-04')
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

  it.each([
    ['le jeudi 15, hors grille', '2026-10-15'],
    ['le lundi 19, sur la grille', '2026-10-19'],
  ])(
    'TR-9 : posologie et « Prochaine dose » %s : le 12 en retard est remplacé, il ne passe pas à renseigner',
    (_, chosen) => {
      const view = preview(input, planOf(input, request(WEEK, [], chosen)))
      expect([keys(view.currentDoses), keys(view.unloggedDoses)]).toEqual([[chosen], []])
      expect(view.dueState({ dueOn: '2026-10-12', dueTime: null })).toBe('removed')
    },
  )

  it.each([
    [
      'Métacam tous les 2 jours du 2 oct., doses du 2 et du 4 données ; le 8, jour d’échéance, « Prochaine dose » le 9 : le 6 reste à renseigner',
      setting('q1', '2026-10-02', TWO_DAYS),
      ['2026-10-02', '2026-10-04'],
      '2026-10-08',
      '2026-10-09',
      '2026-10-06',
    ],
    [
      'tous les jours du 10 oct., doses du 10 au 12 données ; le 14, « Prochaine dose » le 16 : le 13 reste à renseigner',
      setting('q1', '2026-10-10', DAY),
      ['2026-10-10', '2026-10-11', '2026-10-12'],
      '2026-10-14',
      '2026-10-16',
      '2026-10-13',
    ],
  ])('TR-9 : %s', (_, own, days, today, chosen, unlogged) => {
    const carnet = { settings: [own], lines: days.map((day) => line('q1', 'given', day)), today }
    const view = preview(carnet, planOf(carnet, request(own.frequency, [], chosen)))
    expect([keys(view.currentDoses), keys(view.unloggedDoses)]).toEqual([[chosen], [unlogged]])
    expect(view.dueState({ dueOn: unlogged, dueTime: null })).toBe('pending')
  })

  describe('TR-9 : dose du 5 donnée, dose du 12 reportée seule au jeudi 15 ; le 13, posologie et « Prochaine dose » le 26', () => {
    const s1 = setting('s1', '2026-10-05', WEEK)
    const lines = [
      line('s1', 'given', '2026-10-05'),
      line('s1', 'postponed', '2026-10-12', null, '2026-10-15'),
    ]
    const s2 = setting('s2', '2026-10-26', WEEK, [], { startsOn: '2026-10-13' })

    it('la fiche montre le 15 en retard, puis le 26', () => {
      const carnet = { settings: [s1], lines, today: '2026-10-13' }
      expect(planOf(carnet, request(WEEK, [], '2026-10-26')).setting).toMatchObject({
        startsOn: '2026-10-13',
        firstDueOn: '2026-10-26',
        gridOriginOn: '2026-10-26',
      })
      const later = { settings: [s1, s2], lines, today: '2026-10-19' }
      expect(next(later.settings, later.lines, later.today, 2)).toEqual([
        '2026-10-15',
        '2026-10-26',
      ])
    })

    it.each([
      ['le lundi 19, que la date choisie a sorti de la grille', '2026-10-19'],
      ['le mardi 20', '2026-10-20'],
    ])(
      '%s, posologie et « Prochaine dose » le 22 : le 15 en retard est remplacé, il ne passe pas à renseigner',
      (_, today) => {
        const carnet = { settings: [s1, s2], lines, today }
        const view = preview(carnet, planOf(carnet, request(WEEK, [], '2026-10-22')))
        expect([keys(view.currentDoses), keys(view.unloggedDoses)]).toEqual([['2026-10-22'], []])
      },
    )
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

  it('quotidien du 1er oct., posologie seule le 2 et « Prochaine dose » le 5 : les 2, 3 et 4 ne sont plus dus', () => {
    const view = preview(input, planOf(input, request(DAY, [], '2026-10-05')))
    expect([keys(view.currentDoses), keys(view.unloggedDoses)]).toEqual([['2026-10-05'], []])
    expect(shown(input, request(DAY, [], '2026-10-05'))).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ])
  })

  describe('Milo, hebdo du lundi, dose du 5 oct. donnée ; le mercredi 7, posologie seule', () => {
    const monday = setting('m1', '2026-10-05', WEEK)
    const milo = {
      settings: [monday],
      lines: [line('m1', 'given', '2026-10-05')],
      today: '2026-10-07',
    }

    it('« Prochaine dose » le lundi 19, sur la grille : la fiche montre le 19, plus le 12', () => {
      expect(planOf(milo, request(WEEK, [], '2026-10-19')).setting).toMatchObject({
        firstDueOn: '2026-10-19',
        gridOriginOn: '2026-10-19',
      })
      expect(shown(milo, request(WEEK, [], '2026-10-19'), 2)).toEqual(['2026-10-19', '2026-10-26'])
    })

    it('« Prochaine dose » le jeudi 15, hors grille : le calendrier part du 15', () => {
      expect(shown(milo, request(WEEK, [], '2026-10-15'), 2)).toEqual(['2026-10-15', '2026-10-22'])
    })
  })

  it('R3 : tous les 3 mois dès le 13 mars, décalé au 17, remplacé avant son premier jour par tous les 2 jours dès le 17 ; le 15, « Prochaine dose » le 27 : la fiche montre le 27', () => {
    const quarterly = setting('s1', '2026-03-13', { value: 3, unit: 'month' })
    const shift = line('s1', 'shift', '2026-03-13', null, '2026-03-17')
    const everyTwo = setting('s2', '2026-03-17', TWO_DAYS, [], { startsOn: '2026-03-11' })
    const input = { settings: [quarterly, everyTwo], lines: [shift], today: '2026-03-15' }
    expect(shown(input, request(TWO_DAYS, [], '2026-03-27'), 2)).toEqual([
      '2026-03-27',
      '2026-03-29',
    ])
  })

  it.each([
    ['posologie', []],
    ['heures passées à 8 h', ['08:00']],
  ])(
    'TR-9, #794 : tous les jours, première dose choisie le 16 mai par un réglage du 15 avr., dose du 16 reportée au 19 avec décalage ; le 20 avr., posologie (première dose le 19 mai), dose du 19 donnée ; le 24 avr., %s et « Prochaine dose » le 24 : la fiche montre le 24',
    (_, times) => {
      const s1 = setting('s1', '2026-05-16', DAY, [], { startsOn: '2026-04-15' })
      const s2 = setting('s2', '2026-05-19', DAY, [], {
        startsOn: '2026-04-20',
        gridOriginOn: null,
      })
      const input = {
        settings: [s1, s2],
        lines: [
          line('s1', 'postponed', '2026-05-16', null, '2026-05-19'),
          line('s1', 'shift', '2026-05-16', null, '2026-05-19'),
          given('s2', '2026-05-19', null, '2026-04-20'),
        ],
        today: '2026-04-24',
      }
      const day = times.length === 0 ? '2026-04-24' : '2026-04-24 08:00'
      expect(shown(input, request(DAY, times, '2026-04-24'), 1)).toEqual([day])
    },
  )
})

describe('R9, R12 : la date proposée est celle que la fiche montre ensuite', () => {
  it('hebdo du jeudi à 20 h, dose du 2 avr. reportée seule au 7 ; le 27 mars, heures 8 h et 20 h : le 2 avr. à 8 h, puis le 7', () => {
    const thursday = setting('t1', '2026-03-26', WEEK, ['20:00'])
    const input = {
      settings: [thursday],
      lines: [
        line('t1', 'given', '2026-03-26', '20:00'),
        line('t1', 'postponed', '2026-04-02', '20:00', '2026-04-07'),
      ],
      today: '2026-03-27',
    }
    expect(planOf(input, request(WEEK, H)).setting.firstDueOn).toBe('2026-04-02')
    expect(shown(input, request(WEEK, H), 2)).toEqual(['2026-04-02 08:00', '2026-04-07 20:00'])
  })

  it('R6, R10 : hebdo du lundi, tous les 3 jours le 14 (1re dose le 16, donnée le 14 avec décalage puis prise supprimée) ; retour à l’hebdo le 14 : le 16 n’est pas sur la grille du lundi, le décalage est sans effet : le 19, puis le 26', () => {
    const weekly = setting('a', '2026-10-05', WEEK)
    const everyThree = setting('b', '2026-10-16', THREE_DAYS, [], { startsOn: '2026-10-14' })
    const input = {
      settings: [weekly, everyThree],
      lines: [
        line('a', 'given', '2026-10-05'),
        line('a', 'given', '2026-10-12'),
        line('b', 'shift', '2026-10-16', null, '2026-10-14'),
      ],
      today: '2026-10-14',
    }
    expect(planOf(input, request(WEEK)).setting.firstDueOn).toBe('2026-10-19')
    expect(shown(input, request(WEEK), 2)).toEqual(['2026-10-19', '2026-10-26'])
    const read = preview(input, planOf(input, request(WEEK)))
    expect(read.history.find(({ line }) => line.status === 'shift')?.effect).toEqual({
      kind: 'idle',
      reason: 'overtaken',
    })
  })

  it('R6 : hebdo du vendredi, doses du 2 et du 9 données, dose du 16 donnée le 14 avec décalage ; le 14, posologie : le 16 est sur la grille 9, 16, 23, le décalage garde son effet : le 21, puis le 28', () => {
    const friday = setting('a', '2026-10-02', WEEK)
    const input = {
      settings: [friday],
      lines: [
        line('a', 'given', '2026-10-02'),
        line('a', 'given', '2026-10-09'),
        given('a', '2026-10-16', null, '2026-10-14'),
        line('a', 'shift', '2026-10-16', null, '2026-10-14'),
      ],
      today: '2026-10-14',
    }
    expect(shown(input, request(WEEK), 2)).toEqual(['2026-10-21', '2026-10-28'])
  })

  it('R6, R10, R12 : même carnet, toutes les 2 semaines le 14 : le décalage resté du réglage remplacé est sans effet, le 26 oct. proposé et montré, puis le 9 nov.', () => {
    const weekly = setting('a', '2026-10-05', WEEK)
    const everyThree = setting('b', '2026-10-16', THREE_DAYS, [], { startsOn: '2026-10-14' })
    const input = {
      settings: [weekly, everyThree],
      lines: [
        line('a', 'given', '2026-10-05'),
        line('a', 'given', '2026-10-12'),
        line('b', 'shift', '2026-10-16', null, '2026-10-14'),
      ],
      today: '2026-10-14',
    }
    const fortnight = request({ value: 2, unit: 'week' })
    expect(planOf(input, fortnight).setting.firstDueOn).toBe('2026-10-26')
    expect(shown(input, fortnight, 2)).toEqual(['2026-10-26', '2026-11-09'])
  })

  it('R10 : deux réglages sans prise ouverts le 14 reçus de la synchro (tous les 2 jours, puis hebdo) ; heures passées à 9 h : le rythme du lundi continue', () => {
    const weekly = setting('a', '2026-10-05', WEEK)
    const everyTwo = setting('b', '2026-10-14', TWO_DAYS, [], {
      createdAt: '2026-10-14T08:00:00.000Z',
    })
    const backToWeekly = setting('c', '2026-10-19', WEEK, [], {
      startsOn: '2026-10-14',
      gridOriginOn: null,
      createdAt: '2026-10-14T09:00:00.000Z',
    })
    const input = {
      settings: [weekly, everyTwo, backToWeekly],
      lines: [line('a', 'given', '2026-10-05'), line('a', 'given', '2026-10-12')],
      today: '2026-10-14',
    }
    expect(planOf(input, request(WEEK, ['09:00']))).toMatchObject({
      action: 'rewrite',
      id: 'c',
      setting: { firstDueOn: '2026-10-19', gridOriginOn: null },
    })
    expect(shown(input, request(WEEK, ['09:00']), 2)).toEqual([
      '2026-10-19 09:00',
      '2026-10-26 09:00',
    ])
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

  it('R3 : Luna, tous les 3 jours à 8 h dès le 1er avr. ; le 30 mars, posologie (1re échéance le 2, report du 1er supprimé) puis heures à 9 h : 1er, 4, 7 avr. à 9 h', () => {
    const luna = setting('s1', '2026-04-01', THREE_DAYS, ['08:00'], {
      createdAt: '2026-03-30T09:00:00.000Z',
    })
    const dosage = setting('s2', '2026-04-02', THREE_DAYS, ['08:00'], {
      startsOn: '2026-03-30',
      gridOriginOn: null,
      createdAt: '2026-03-30T09:05:00.000Z',
    })
    const input = { settings: [luna, dosage], lines: [], today: '2026-03-30' }
    expect(shown(input, request(THREE_DAYS, ['09:00']))).toEqual([
      '2026-04-01 09:00',
      '2026-04-04 09:00',
      '2026-04-07 09:00',
    ])
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

  describe('TR-9 : même rythme, aucune prise, « Prochaine dose » choisie', () => {
    const ahead = setting('p1', '2026-10-12', WEEK, [], { startsOn: '2026-10-05' })
    const input = { settings: [ahead], lines: [], today: '2026-10-07' }

    it('hebdo dont la première dose est le lundi 12, rien noté ; le 7, posologie et le 14 : la première dose est corrigée au 14', () => {
      expect(planOf(input, request(WEEK, [], '2026-10-14'))).toMatchObject({
        action: 'rewrite',
        id: 'p1',
        setting: { startsOn: '2026-10-05', firstDueOn: '2026-10-14', gridOriginOn: '2026-10-14' },
      })
      expect(shown(input, request(WEEK, [], '2026-10-14'), 2)).toEqual(['2026-10-14', '2026-10-21'])
    })

    it('R6 : la dose du 12 donnée le 7 avec décalage, puis la prise supprimée ; le 7, posologie et « Prochaine dose » le 19 : la fiche montre le 19', () => {
      const shifted = { ...input, lines: [line('p1', 'shift', '2026-10-12', null, '2026-10-07')] }
      expect(shown(shifted, request(WEEK, [], '2026-10-19'), 2)).toEqual([
        '2026-10-19',
        '2026-10-26',
      ])
    })

    it('Q7 : une date avant aujourd’hui est refusée', () => {
      expect(newSettings(input, request(WEEK, [], '2026-10-06'))).toEqual({
        refusal: { reason: 'too-early', earliest: '2026-10-07' },
      })
    })
  })

  describe('Q38 : hebdo du lundi depuis le 5 (dose du 5 donnée), posologie le 6 sans prise, le 12 non donné ; le 14, heures passées à 9 h', () => {
    const s1 = setting('s1', '2026-10-05', WEEK)
    const s2 = setting('s2', '2026-10-12', WEEK, [], { startsOn: '2026-10-06', gridOriginOn: null })
    const input = {
      settings: [s1, s2],
      lines: [line('s1', 'given', '2026-10-05')],
      today: '2026-10-14',
    }

    function questionOf(asked: SettingsRequest) {
      const result = newSettings(input, asked)
      if (!('question' in result)) throw new Error(`pas de question : ${JSON.stringify(result)}`)
      return result.question
    }

    it('« Elles n’étaient pas à donner » : le 12 sort du carnet, le rythme du lundi continue (19, 26)', () => {
      const { correct } = questionOf(request(WEEK, ['09:00']))
      expect(correct.setting.firstDueOn).toBe('2026-10-19')
      const view = preview(input, correct)
      expect([keys(view.currentDoses), keys(view.unloggedDoses)]).toEqual([
        ['2026-10-19 09:00'],
        [],
      ])
      expect(keys(view.upcoming({ limit: 2 }))).toEqual(['2026-10-19 09:00', '2026-10-26 09:00'])
    })

    it('la date proposée passée en clair par le formulaire ne change rien', () => {
      const asked = request(WEEK, ['09:00'])
      const proposed = questionOf(asked).keep.setting.firstDueOn
      expect(newSettings(input, { ...asked, firstDueOn: proposed })).toEqual(
        newSettings(input, asked),
      )
    })
  })

  it('pas encore commencé : une première dose choisie plus tôt avance aussi le début du réglage', () => {
    const ahead = setting('p1', '2026-10-10', WEEK)
    const input = { settings: [ahead], lines: [], today: '2026-10-05' }
    expect(newSettings(input, request(DAY, [], '2026-10-06'))).toEqual({
      plan: {
        action: 'rewrite',
        id: 'p1',
        setting: expect.objectContaining({ startsOn: '2026-10-06', firstDueOn: '2026-10-06' }),
      },
    })
  })
})
