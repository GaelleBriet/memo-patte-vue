// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { referenceReading } from '../domain/dose-calendar/reference-model'
import {
  DAY,
  H,
  line,
  MONTH,
  next,
  read,
  setting,
  TWO_DAYS,
  WEEK,
} from './dose-calendar.reference.aides'

describe('R2 : la grille', () => {
  it('un mensuel du 31 janv. tombe le dernier jour des mois courts sans que l’origine change', () => {
    expect(next([setting('p1', '2026-01-31', MONTH)], [], '2026-01-30', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('chaque journée a les heures du réglage, aucune après la date de fin', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H, { endsOn: '2026-10-03' })
    expect(read([p1], [], '2026-09-30').upcoming).toEqual([
      '2026-10-01 08:00',
      '2026-10-01 20:00',
      '2026-10-03 08:00',
      '2026-10-03 20:00',
    ])
  })

  it('un réglage dont la première échéance est loin se lit jusqu’à elle, pas comme une fin', () => {
    const p1 = setting('p1', '2026-03-01', MONTH)
    const p2 = setting('p2', '2026-09-01', { value: 3, unit: 'month' }, [], {
      startsOn: '2026-04-01',
    })
    const today = '2026-04-01'
    const lines = [line('p1', 'given', '2026-03-01')]
    expect(referenceReading({ settings: [p1, p2], lines, today, until: today })).toMatchObject({
      phase: 'upcoming',
      current: ['2026-09-01'],
    })
  })
})

describe('R3 : l’origine se transmet', () => {
  it('heures changées le 20 févr. sur un mensuel du 31 : 28 févr., 31 mars, 30 avr.', () => {
    const p1 = setting('p1', '2026-01-31', MONTH, ['08:00'])
    const p2 = setting('p2', '2026-02-28', MONTH, ['09:00'], {
      startsOn: '2026-02-20',
      gridOriginOn: null,
    })
    expect(next([p1, p2], [line('p1', 'given', '2026-01-31', '08:00')], '2026-02-20')).toEqual([
      '2026-02-28 09:00',
      '2026-03-31 09:00',
      '2026-04-30 09:00',
    ])
  })

  it('l’origine héritée comprend le décalage en vigueur', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    const lines = [
      line('p1', 'given', '2026-10-02'),
      line('p1', 'shift', '2026-10-09', null, '2026-10-12'),
      line('p1', 'given', '2026-10-09'),
    ]
    const p2 = setting('p2', '2026-10-19', WEEK, [], { startsOn: '2026-10-13', gridOriginOn: null })
    expect(next([p1, p2], lines, '2026-10-13')).toEqual(['2026-10-19', '2026-10-26', '2026-11-02'])
  })

  it('même fréquence : les journées d’avant la première échéance du réglage restent celles de la grille', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const p2 = setting('p2', '2026-10-05', TWO_DAYS, H, {
      startsOn: '2026-10-03',
      gridOriginOn: null,
    })
    const lines = [line('p1', 'given', '2026-10-03', '08:00')]
    expect(read([p1, p2], lines, '2026-10-03').current).toEqual(['2026-10-03 20:00'])
  })
})

describe('R3, R6 : un décalage et un changement de fréquence', () => {
  it('écrit sous l’ancien réglage, un décalage est dépassé par la nouvelle origine', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS)
    const p2 = setting('p2', '2026-10-04', { value: 3, unit: 'day' }, [], {
      startsOn: '2026-10-02',
    })
    const lines = [
      line('p1', 'given', '2026-10-01'),
      line('p1', 'shift', '2026-10-05', null, '2026-10-06'),
    ]
    expect(next([p1, p2], lines, '2026-10-02')).toEqual(['2026-10-04', '2026-10-07', '2026-10-10'])
  })

  it('écrit sous le nouveau réglage, il fait repartir la suite', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS)
    const p2 = setting('p2', '2026-10-04', { value: 3, unit: 'day' }, [], {
      startsOn: '2026-10-02',
    })
    const lines = [
      line('p1', 'given', '2026-10-01'),
      line('p2', 'shift', '2026-10-07', null, '2026-10-08'),
    ]
    expect(next([p1, p2], lines, '2026-10-02')).toEqual(['2026-10-04', '2026-10-07', '2026-10-11'])
  })
})

describe('R4 : ce qu’une prise couvre', () => {
  it('une prise oubliée couvre son échéance comme une prise donnée', () => {
    const p1 = setting('p1', '2026-10-01', DAY)
    expect(read([p1], [line('p1', 'missed', '2026-10-01')], '2026-10-01').current).toEqual([
      '2026-10-02',
    ])
  })

  it('le jour où les heures changent, une prise couvre la première heure du nouveau réglage', () => {
    const p1 = setting('p1', '2026-10-01', DAY, H)
    const p2 = setting('p2', '2026-10-02', DAY, ['09:00', '21:00'], { gridOriginOn: null })
    const lines = [line('p1', 'given', '2026-10-02', '08:00')]
    expect(read([p1, p2], lines, '2026-10-02').current).toEqual(['2026-10-02 21:00'])
  })

  it('même réglage d’heures : la prise couvre exactement son heure', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const p2 = setting('p2', '2026-10-03', TWO_DAYS, H, {
      startsOn: '2026-10-02',
      gridOriginOn: null,
    })
    const lines = [line('p1', 'given', '2026-10-03', '20:00')]
    expect(read([p1, p2], lines, '2026-10-02').upcoming.slice(0, 2)).toEqual([
      '2026-10-03 08:00',
      '2026-10-05 08:00',
    ])
  })
})

describe('R5 : une prise en plus ne couvre rien', () => {
  it('la dose du 16 reste due', () => {
    const p1 = setting('p1', '2026-10-09', WEEK)
    const lines = [line('p1', 'given', '2026-10-09'), line('p1', 'extra', '2026-10-07')]
    expect(read([p1], lines, '2026-10-10').current).toEqual(['2026-10-16'])
  })
})

describe('R6 : seul un décalage déplace la suite', () => {
  it('une prise en retard sans décalage ne déplace rien', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    expect(next([p1], [line('p1', 'given', '2026-10-16')], '2026-10-19', 2)).toEqual([
      '2026-10-23',
      '2026-10-30',
    ])
  })

  it('le décalage ancré au 19 fait repartir la suite du 19', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    const lines = [
      line('p1', 'given', '2026-10-16'),
      line('p1', 'shift', '2026-10-16', null, '2026-10-19'),
    ]
    expect(next([p1], lines, '2026-10-19', 2)).toEqual(['2026-10-26', '2026-11-02'])
  })

  it('un décalage survit à la suppression de sa prise', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    const lines = [
      line('p1', 'given', '2026-10-02'),
      line('p1', 'given', '2026-10-09'),
      line('p1', 'shift', '2026-10-16', null, '2026-10-19'),
    ]
    const reading = read([p1], lines, '2026-10-20')
    expect([reading.current, reading.upcoming.slice(0, 2)]).toEqual([
      ['2026-10-16'],
      ['2026-10-26', '2026-11-02'],
    ])
  })
})

describe('R2, R3 : un réglage qui en remplace un jamais commencé', () => {
  it('un nouveau réglage de même fréquence ne reprend pas la première dose future du précédent', () => {
    const p2 = setting('p2', '2026-04-06', DAY, H, { startsOn: '2026-03-25' })
    const p3 = setting('p3', '2026-03-25', DAY, H)
    expect(
      read([p2, p3], [line('p2', 'given', '2026-04-06', '08:00')], '2026-03-25').upcoming,
    ).toContain('2026-03-26 08:00')
  })
})

describe('R3, R10 : un changement de réglage fait avant la première dose (décision du 2026-10-11)', () => {
  const THREE_DAYS = { value: 3, unit: 'day' as const }

  it('graine 640000526 : tous les 3 jours à 20 h du 6 avr., posologie le 5 (première échéance le 8, arrivée d’un report supprimé depuis) : 6, 9, 12', () => {
    const p1 = setting('p1', '2026-04-06', THREE_DAYS, ['20:00'])
    const p2 = setting('p2', '2026-04-08', THREE_DAYS, ['20:00'], {
      startsOn: '2026-04-05',
      gridOriginOn: null,
    })
    const expected = ['2026-04-06 20:00', '2026-04-09 20:00', '2026-04-12 20:00']
    expect(next([p1, p2], [], '2026-04-06')).toEqual(expected)
    const p3 = setting('p3', '2026-04-06', THREE_DAYS, ['20:00'], {
      startsOn: '2026-04-06',
      gridOriginOn: null,
    })
    expect(next([p1, p2, p3], [], '2026-04-06')).toEqual(expected)
  })

  it('créé le 1er avr., première dose le 6, dose du 6 reportée au 8 sous la création, posologie le 4 (première échéance le 8), report supprimé : 6, 9, 12', () => {
    const p1 = setting('p1', '2026-04-06', THREE_DAYS, ['20:00'], { startsOn: '2026-04-01' })
    const p2 = setting('p2', '2026-04-08', THREE_DAYS, ['20:00'], {
      startsOn: '2026-04-04',
      gridOriginOn: null,
    })
    const report = line('p1', 'postponed', '2026-04-06', '20:00', '2026-04-08')
    expect(next([p1, p2], [report], '2026-04-05')).toEqual([
      '2026-04-08 20:00',
      '2026-04-09 20:00',
      '2026-04-12 20:00',
    ])
    expect(next([p1, p2], [], '2026-04-05')).toEqual([
      '2026-04-06 20:00',
      '2026-04-09 20:00',
      '2026-04-12 20:00',
    ])
  })

  it('graine 640001351 : toutes les 6 semaines du 22 mars, décalage du 22 au 23, posologie le 20 (première échéance le 23) : 22 mars, puis 4 mai', () => {
    const SIX_WEEKS = { value: 6, unit: 'week' as const }
    const p1 = setting('p1', '2026-03-22', SIX_WEEKS)
    const p2 = setting('p2', '2026-03-23', SIX_WEEKS, [], {
      startsOn: '2026-03-20',
      gridOriginOn: null,
    })
    const shift = line('p1', 'shift', '2026-03-22', null, '2026-03-23')
    expect(next([p1, p2], [shift], '2026-03-20', 2)).toEqual(['2026-03-22', '2026-05-04'])
  })
})

describe('R7, R9 : la journée d’arrivée devenue première échéance d’une posologie (décision du 2026-10-11)', () => {
  it('graine 620002762 : chaque semaine à 8, 14, 20 h du 24 mars, 14 h reportée au 12 avr. avec décalage, posologies le 25 et le 28 : le 12 ne reçoit que 14 h', () => {
    const times = ['08:00', '14:00', '20:00']
    const endsOn = '2026-04-25'
    const p1 = setting('p1', '2026-03-24', WEEK, times, { endsOn })
    const p2 = setting('p2', '2026-04-13', WEEK, times, {
      startsOn: '2026-03-25',
      gridOriginOn: null,
      endsOn,
    })
    const p3 = setting('p3', '2026-04-12', WEEK, times, {
      startsOn: '2026-03-28',
      gridOriginOn: null,
      endsOn,
    })
    const lines = [
      line('p1', 'given', '2026-03-24', '08:00'),
      line('p1', 'missed', '2026-03-24', '20:00'),
      line('p1', 'postponed', '2026-03-24', '14:00', '2026-04-12'),
      line('p1', 'shift', '2026-03-24', '14:00', '2026-04-12'),
    ]
    const expected = ['2026-04-12 14:00', '2026-04-19 08:00', '2026-04-19 14:00']
    expect(next([p1, p2], lines, '2026-03-28')).toEqual(expected)
    expect(next([p1, p2, p3], lines, '2026-03-28')).toEqual(expected)
  })
})

describe('R7, R9.2 : la dose avancée dont l’arrivée devient la première échéance d’un nouveau rythme (relecture du pas 3)', () => {
  it.each([
    ['avancée au 12', '2026-04-12', ['2026-04-12 23:00', '2026-05-24 06:00']],
    ['reportée au 14', '2026-04-14', ['2026-04-14 23:00', '2026-05-26 06:00']],
  ])(
    'toutes les 2 semaines à 20 h du 30 mars, dose du 13 %s, puis toutes les 6 semaines à 6, 12, 18, 23 h : la journée d’arrivée n’a que 23 h',
    (_, arrival, expected) => {
      const p1 = setting('p1', '2026-03-30', { value: 2, unit: 'week' }, ['20:00'])
      const p2 = setting(
        'p2',
        arrival,
        { value: 6, unit: 'week' },
        ['06:00', '12:00', '18:00', '23:00'],
        {
          startsOn: '2026-04-02',
        },
      )
      const lines = [
        line('p1', 'given', '2026-03-30', '20:00'),
        line('p1', 'postponed', '2026-04-13', '20:00', arrival),
      ]
      expect(next([p1, p2], lines, '2026-04-02', 2)).toEqual(expected)
    },
  )
})

describe('R7, R9.2 : un rythme qui ne part plus de l’arrivée d’un report n’en efface pas les heures (relecture du pas 3)', () => {
  it('hebdo à 20 h, doses des 6 et 13 avr. données, dose du 20 avancée au 16 ; le 14, tous les 2 jours dès le 16 ; le 15, tous les jours à 8 et 20 h : le 16 garde 8 h', () => {
    const p1 = setting('p1', '2026-04-06', WEEK, ['20:00'])
    const p2 = setting('p2', '2026-04-16', TWO_DAYS, ['20:00'], { startsOn: '2026-04-14' })
    const p3 = setting('p3', '2026-04-15', DAY, H, { startsOn: '2026-04-15' })
    const lines = [
      line('p1', 'given', '2026-04-06', '20:00'),
      line('p1', 'given', '2026-04-13', '20:00'),
      line('p1', 'postponed', '2026-04-20', '20:00', '2026-04-16'),
    ]
    expect(next([p1, p2, p3], lines, '2026-04-15', 5)).toEqual([
      '2026-04-15 08:00',
      '2026-04-15 20:00',
      '2026-04-16 08:00',
      '2026-04-16 20:00',
      '2026-04-17 08:00',
    ])
  })

  it('hebdo à 20 h, dose du 13 avr. reportée au 15 ; le 8, tous les 2 jours dès le 15 ; le 9, tous les 3 jours à 8 et 20 h dès le 12 : le 15 garde 8 h', () => {
    const p1 = setting('p1', '2026-04-06', WEEK, ['20:00'])
    const p2 = setting('p2', '2026-04-15', TWO_DAYS, ['20:00'], { startsOn: '2026-04-08' })
    const p3 = setting('p3', '2026-04-12', { value: 3, unit: 'day' }, H, { startsOn: '2026-04-09' })
    const lines = [
      line('p1', 'given', '2026-04-06', '20:00'),
      line('p1', 'postponed', '2026-04-13', '20:00', '2026-04-15'),
    ]
    expect(read([p1, p2, p3], lines, '2026-04-09').upcoming.slice(2, 5)).toEqual([
      '2026-04-15 08:00',
      '2026-04-15 20:00',
      '2026-04-18 08:00',
    ])
  })
})

describe('R9 : un réglage écrit avant la première dose, fréquence changée (relecture du pas 3)', () => {
  it.each([
    ['tous les jours dès le 3', DAY, '2026-10-03', ['2026-10-03', '2026-10-04', '2026-10-05']],
    [
      'tous les 3 jours dès le 5',
      { value: 3, unit: 'day' as const },
      '2026-10-05',
      ['2026-10-05', '2026-10-08', '2026-10-11'],
    ],
  ])(
    'hebdomadaire, première dose le 6, reportée au 8 ; le 3, %s : la date choisie est la première échéance',
    (_, frequency, firstDueOn, expected) => {
      const p1 = setting('p1', '2026-10-06', WEEK)
      const p2 = setting('p2', firstDueOn, frequency, [], { startsOn: '2026-10-03' })
      const lines = [line('p1', 'postponed', '2026-10-06', null, '2026-10-08')]
      expect(next([p1, p2], lines, '2026-10-03')).toEqual(expected)
    },
  )
})

describe('R1, R4 : la prise du jour d’un changement de réglage garde son échéance', () => {
  const monthly = setting('p1', '2026-09-05', MONTH)
  const given = [line('p1', 'given', '2026-09-05'), line('p1', 'given', '2026-10-05')]

  it('mensuel du 5, dose du 5 oct. donnée, hebdo à partir du 12 : le 12, puis le 19', () => {
    const weekly = setting('p2', '2026-10-12', WEEK, [], { startsOn: '2026-10-05' })
    expect(next([monthly, weekly], given, '2026-10-05', 2)).toEqual(['2026-10-12', '2026-10-19'])
  })

  it('mensuel du 5, dose du 5 oct. donnée, quotidien à partir du 6 : le 6', () => {
    const daily = setting('p2', '2026-10-06', DAY, [], { startsOn: '2026-10-05' })
    expect(next([monthly, daily], given, '2026-10-05', 1)).toEqual(['2026-10-06'])
  })
})

describe('R8, Q-G3 : la prise d’avant l’arrêt notée le jour de la reprise (décision du 2026-10-12, #784)', () => {
  it('reprise le 23 mars, hebdo à 8, 14 et 20 h dès le 24, 20 h du 24 avancée au 23, prise d’avant l’arrêt du 23 à 20 h : rien à redonner le 23', () => {
    const p1 = setting('p1', '2026-03-20', DAY, ['08:00', '14:00', '20:00'], {
      stoppedOn: '2026-03-23',
    })
    const p2 = setting('p2', '2026-03-24', WEEK, ['08:00', '14:00', '20:00'], {
      startsOn: '2026-03-23',
    })
    const lines = [
      line('p1', 'given', '2026-03-23', '20:00'),
      line('p2', 'postponed', '2026-03-24', '20:00', '2026-03-23'),
    ]
    expect(next([p1, p2], lines, '2026-03-23', 1)).toEqual(['2026-03-24 08:00'])
  })
})

describe('R6 : un décalage ne vaut que si sa journée d’origine est une échéance du calendrier en vigueur (décision du 2026-10-12)', () => {
  it('hebdo du lundi, tous les 3 jours dès le 16 réécrit le 14 en toutes les 2 semaines dès le 26, décalage du 16 au 14 resté : 26 oct., 9 nov.', () => {
    const weekly = setting('a', '2026-10-05', WEEK)
    const fortnight = setting('b', '2026-10-26', { value: 2, unit: 'week' }, [], {
      startsOn: '2026-10-14',
    })
    const lines = [
      line('a', 'given', '2026-10-05'),
      line('a', 'given', '2026-10-12'),
      line('b', 'shift', '2026-10-16', null, '2026-10-14'),
    ]
    expect(next([weekly, fortnight], lines, '2026-10-14', 2)).toEqual(['2026-10-26', '2026-11-09'])
    const dosage = setting('c', '2026-10-26', { value: 2, unit: 'week' }, [], {
      startsOn: '2026-10-15',
      gridOriginOn: null,
    })
    expect(next([weekly, fortnight, dosage], lines, '2026-10-15', 2)).toEqual([
      '2026-10-26',
      '2026-11-09',
    ])
  })

  it('hebdo du lundi, tous les 3 jours dès le 16 réécrit le 14 en hebdo (première dose le 19), décalage du 16 au 14 resté : le 16 n’est pas sur la grille du lundi, 19, 26', () => {
    const weekly = setting('a', '2026-10-05', WEEK)
    const back = setting('b', '2026-10-19', WEEK, [], {
      startsOn: '2026-10-14',
      gridOriginOn: null,
    })
    const lines = [
      line('a', 'given', '2026-10-05'),
      line('a', 'given', '2026-10-12'),
      line('b', 'shift', '2026-10-16', null, '2026-10-14'),
    ]
    expect(next([weekly, back], lines, '2026-10-14', 2)).toEqual(['2026-10-19', '2026-10-26'])
  })

  it('hebdo du vendredi, dose du 16 donnée le 14 avec décalage, posologie le 14 : le 16 est sur la grille 9, 16, 23, le décalage vaut : 21, 28', () => {
    const friday = setting('a', '2026-10-02', WEEK)
    const dosage = setting('b', '2026-10-16', WEEK, [], {
      startsOn: '2026-10-14',
      gridOriginOn: null,
    })
    const lines = [
      line('a', 'given', '2026-10-02'),
      line('a', 'given', '2026-10-09'),
      line('a', 'given', '2026-10-16'),
      line('a', 'shift', '2026-10-16', null, '2026-10-14'),
    ]
    expect(next([friday, dosage], lines, '2026-10-14', 2)).toEqual(['2026-10-21', '2026-10-28'])
  })

  it('R6, TR-9 : hebdo du lundi 5 oct., réglage du 7 réécrit en hebdo, première dose choisie le 2 nov., décalage du lundi 12 au 14 écrit sous ce réglage : sans effet avant la date choisie : 2, 9 nov. (graine 870000527)', () => {
    const s1 = setting('s1', '2026-10-05', WEEK)
    const s2 = setting('s2', '2026-11-02', WEEK, [], { startsOn: '2026-10-07' })
    const lines = [line('s2', 'shift', '2026-10-12', null, '2026-10-14')]
    expect(next([s1, s2], lines, '2026-10-07', 2)).toEqual(['2026-11-02', '2026-11-09'])
  })

  it('#794 : mensuel du 29 mars, dose du 29 reportée au 5 avr. ; réglage du 31, première dose choisie le 9 juin, décalage du 5 au 9 avr. : la dose reportée vient de l’ancien rythme, le décalage est sans effet : 5 avr., 9 juin, 9 juil.', () => {
    const s1 = setting('s1', '2026-03-29', MONTH)
    const s2 = setting('s2', '2026-06-09', MONTH, [], { startsOn: '2026-03-31' })
    const lines = [
      line('s1', 'postponed', '2026-03-29', null, '2026-04-05'),
      line('s2', 'shift', '2026-04-05', null, '2026-04-09'),
    ]
    expect(next([s1, s2], lines, '2026-03-31')).toEqual(['2026-04-05', '2026-06-09', '2026-07-09'])
  })

  it('toutes les 6 semaines, première dose choisie le 18 août, avancée seule au 8 juil., puis au 3 juin avec décalage : la dose avancée est celle du rythme, le décalage vaut : 3 juin, 15 juil., 26 août', () => {
    const six = { value: 6, unit: 'week' as const }
    const s1 = setting('s1', '2026-03-26', { value: 3, unit: 'month' })
    const s2 = setting('s2', '2026-08-18', six, [], { startsOn: '2026-03-29' })
    const lines = [
      line('s1', 'given', '2026-03-26'),
      line('s2', 'postponed', '2026-08-18', null, '2026-07-08'),
      line('s2', 'postponed', '2026-07-08', null, '2026-06-03'),
      line('s2', 'shift', '2026-07-08', null, '2026-06-03'),
    ]
    expect(next([s1, s2], lines, '2026-03-30')).toEqual(['2026-06-03', '2026-07-15', '2026-08-26'])
  })

  it('hebdo dont la première dose est le 19 (choisie), décalage du 12 au 7 resté : 19, 26', () => {
    const weekly = setting('p1', '2026-10-19', WEEK, [], { startsOn: '2026-10-05' })
    const lines = [line('p1', 'shift', '2026-10-12', null, '2026-10-07')]
    expect(next([weekly], lines, '2026-10-07', 2)).toEqual(['2026-10-19', '2026-10-26'])
  })
})

describe('TR-9 : à fréquence gardée, une « Prochaine dose » choisie remplace la dose en retard (décision du 2026-10-12)', () => {
  const monday = setting('m1', '2026-10-05', WEEK)
  const lines = [line('m1', 'given', '2026-10-05')]

  it.each(['2026-10-15', '2026-10-19'])(
    'hebdo du lundi, le 12 non donné ; le 14, posologie et première dose le %s : ni retard ni à renseigner',
    (chosen) => {
      const s2 = setting('m2', chosen, WEEK, [], { startsOn: '2026-10-14' })
      const reading = read([monday, s2], lines, '2026-10-14')
      expect([reading.current, reading.unlogged]).toEqual([[chosen], []])
    },
  )

  it.each([
    [
      'tous les 2 jours du 2 oct., doses du 2 et du 4 données ; le 8, jour d’échéance, première dose le 9',
      TWO_DAYS,
      '2026-10-02',
      ['2026-10-02', '2026-10-04'],
      '2026-10-08',
      '2026-10-09',
      '2026-10-06',
    ],
    [
      'tous les jours du 10 oct., doses du 10 au 12 données ; le 14, première dose le 16',
      DAY,
      '2026-10-10',
      ['2026-10-10', '2026-10-11', '2026-10-12'],
      '2026-10-14',
      '2026-10-16',
      '2026-10-13',
    ],
  ])(
    '%s : la dose du jour est remplacée, la plus ancienne reste à renseigner',
    (_, frequency, from, days, today, chosen, unlogged) => {
      const own = setting('q1', from, frequency)
      const s2 = setting('q2', chosen, frequency, [], { startsOn: today })
      const reading = read(
        [own, s2],
        days.map((day) => line('q1', 'given', day)),
        today,
      )
      expect([reading.current, reading.unlogged]).toEqual([[chosen], [unlogged]])
    },
  )

  it('#794 : tous les jours, première dose choisie le 16 mai, dose du 16 reportée au 19 avec décalage, posologie le 20 avr., dose du 19 donnée ; le 24 avr., première dose choisie le 24 : le 24', () => {
    const s1 = setting('s1', '2026-05-16', DAY, [], { startsOn: '2026-04-15' })
    const s2 = setting('s2', '2026-05-19', DAY, [], { startsOn: '2026-04-20', gridOriginOn: null })
    const s3 = setting('s3', '2026-04-24', DAY, [], { startsOn: '2026-04-24' })
    const lines = [
      line('s1', 'postponed', '2026-05-16', null, '2026-05-19'),
      line('s1', 'shift', '2026-05-16', null, '2026-05-19'),
      line('s2', 'given', '2026-05-19'),
    ]
    expect(next([s1, s2, s3], lines, '2026-04-24', 2)).toEqual(['2026-04-24', '2026-04-25'])
  })

  it.each(['2026-10-19', '2026-10-20'])(
    'hebdo du lundi, dose du 5 donnée, dose du 12 reportée seule au 15 ; le 13, posologie et première dose le 26 ; le %s, posologie et première dose le 22 : le 15 est remplacé, ni retard ni à renseigner',
    (today) => {
      const s2 = setting('m2', '2026-10-26', WEEK, [], { startsOn: '2026-10-13' })
      const s3 = setting('m3', '2026-10-22', WEEK, [], { startsOn: today })
      const reported = [...lines, line('m1', 'postponed', '2026-10-12', null, '2026-10-15')]
      expect(next([monday, s2], reported, today, 2)).toEqual(['2026-10-15', '2026-10-26'])
      const reading = read([monday, s2, s3], reported, today)
      expect([reading.current, reading.unlogged]).toEqual([['2026-10-22'], []])
    },
  )
})

describe('R7, R9 : un réglage qui part du jour d’arrivée d’un report', () => {
  it('20 h du 3 reportée au 4, tous les 3 jours à partir du 4 : 20 h le 4, puis le 7', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const p2 = setting('p2', '2026-10-04', { value: 3, unit: 'day' }, H)
    const lines = [
      line('p1', 'given', '2026-10-03', '08:00'),
      line('p1', 'postponed', '2026-10-03', '20:00', '2026-10-04'),
    ]
    expect(next([p1, p2], lines, '2026-10-04', 3)).toEqual([
      '2026-10-04 20:00',
      '2026-10-07 08:00',
      '2026-10-07 20:00',
    ])
  })
})

describe('modèle de référence : indépendant du moteur, de l’app et de l’horloge', () => {
  const folder = fileURLToPath(new URL('../domain/dose-calendar/', import.meta.url))
  const sources = readdirSync(folder)
    .filter((name) => name.startsWith('reference-'))
    .map((name) => ({ name, text: readFileSync(join(folder, name), 'utf8') }))

  it('n’importe que ses propres modules, et ne lit jamais l’heure', () => {
    const imports = sources.flatMap(({ text }) =>
      [...text.matchAll(/from '([^']+)'/g)].map(([, path]) => path ?? ''),
    )
    expect(sources.length).toBeGreaterThan(0)
    expect(imports.filter((path) => !path.startsWith('./reference-'))).toEqual([])
    expect(sources.filter(({ text }) => /Date\.now\(|new Date\(\)/.test(text))).toEqual([])
  })

  it('n’est importé par aucun module de l’app', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const importers = (readdirSync(root, { recursive: true }) as string[])
      .filter((path) => /\.(ts|vue)$/.test(path) && !path.includes('__tests__'))
      .filter((path) => !path.includes('dose-calendar/reference-'))
      .filter((path) => readFileSync(join(root, path), 'utf8').includes('dose-calendar/reference-'))
    expect(importers).toEqual([])
  })
})

describe('R9, Q-retard : une dose en retard reste la dose du moment à fréquence gardée (décision du 2026-10-11)', () => {
  const monday = setting('p1', '2026-10-05', WEEK)
  const given = line('p1', 'given', '2026-10-05')

  it('hebdo du lundi, dose du lundi 12 non donnée, posologie changée le mercredi 14 : le 12 reste en retard', () => {
    const posology = setting('p2', '2026-10-12', WEEK, [], {
      startsOn: '2026-10-14',
      gridOriginOn: null,
    })
    const reading = read([monday, posology], [given], '2026-10-14')
    expect([reading.phase, reading.current, reading.unlogged]).toEqual([
      'overdue',
      ['2026-10-12'],
      [],
    ])
  })

  it('fréquence changée le 14 (toutes les 2 semaines dès le 19) : le 12 est à renseigner', () => {
    const rhythm = setting('p2', '2026-10-19', { value: 2, unit: 'week' }, [], {
      startsOn: '2026-10-14',
    })
    const reading = read([monday, rhythm], [given], '2026-10-14')
    expect([reading.phase, reading.current, reading.unlogged]).toEqual([
      'upcoming',
      ['2026-10-19'],
      ['2026-10-12'],
    ])
  })
})

describe('R3, R10 : un réglage remplacé le jour même transmet sa grille au réglage de même fréquence (#781)', () => {
  const weekly = setting('s1', '2026-10-01', WEEK)
  const lines = [
    line('s1', 'given', '2026-10-01'),
    line('s1', 'postponed', '2026-10-08', null, '2026-10-12'),
  ]
  const fortnightly = setting('s2', '2026-10-14', { value: 2, unit: 'week' }, [], {
    startsOn: '2026-10-10',
  })

  it('hebdo, dose du 8 reportée seule au 12 ; le 10, toutes les 2 semaines dès le 14, puis posologie le même jour : 12, 14, 28', () => {
    const posology = setting('s3', '2026-10-12', { value: 2, unit: 'week' }, [], {
      startsOn: '2026-10-10',
      gridOriginOn: null,
    })
    expect(next([weekly, fortnightly, posology], lines, '2026-10-10')).toEqual([
      '2026-10-12',
      '2026-10-14',
      '2026-10-28',
    ])
  })

  it('le même jour, un réglage hebdomadaire reçu d’un autre appareil garde la grille du lundi : 12, 15, 22', () => {
    const other = setting('s3', '2026-10-12', WEEK, [], {
      startsOn: '2026-10-10',
      gridOriginOn: null,
    })
    expect(next([weekly, fortnightly, other], lines, '2026-10-10')).toEqual([
      '2026-10-12',
      '2026-10-15',
      '2026-10-22',
    ])
  })
})

describe('R3, R6 : un décalage écrit avant un changement de fréquence reste dépassé sous une posologie', () => {
  const s1 = setting('s1', '2026-03-13', { value: 3, unit: 'day' }, ['20:00'])
  const s2 = setting('s2', '2026-03-15', { value: 2, unit: 'week' }, ['20:00'], {
    startsOn: '2026-03-14',
  })
  const lines = [
    line('s1', 'postponed', '2026-03-13', '20:00', '2026-03-15'),
    { ...line('s1', 'given', '2026-03-15', '20:00'), givenOn: '2026-03-14' },
    line('s1', 'shift', '2026-03-15', '20:00', '2026-03-14'),
  ]

  it('tous les 3 jours à 20 h, dose du 13 reportée seule au 15 et donnée le 14 avec décalage ; le 14, toutes les 2 semaines dès le 15 ; le 15, posologie : 29 mars, 12 et 26 avr.', () => {
    const s3 = setting('s3', '2026-03-29', { value: 2, unit: 'week' }, ['20:00'], {
      startsOn: '2026-03-15',
      gridOriginOn: null,
    })
    const expected = ['2026-03-29 20:00', '2026-04-12 20:00', '2026-04-26 20:00']
    expect(next([s1, s2], lines, '2026-03-15')).toEqual(expected)
    expect(next([s1, s2, s3], lines, '2026-03-15')).toEqual(expected)
  })
})

describe('R3 : une date choisie sur la grille d’un décalage à venir continue le rythme', () => {
  const s1 = setting('s1', '2026-03-20', MONTH, ['20:00'])
  const lines = [
    { ...line('s1', 'given', '2026-04-20', '20:00'), givenOn: '2026-03-25' },
    line('s1', 'shift', '2026-04-20', '20:00', '2026-03-25'),
  ]
  const s2 = setting('s2', '2026-06-25', MONTH, ['20:00'], { startsOn: '2026-03-27' })

  it('mensuel du 20 mars à 20 h, dose du 20 avr. donnée le 25 mars avec décalage ; le 27, première dose le 25 juin ; le 29, posologie : la même suite', () => {
    const s3 = setting('s3', '2026-04-25', MONTH, ['20:00'], {
      startsOn: '2026-03-29',
      gridOriginOn: null,
    })
    expect(next([s1, s2, s3], lines, '2026-03-29', 4)).toEqual(
      next([s1, s2], lines, '2026-03-29', 4),
    )
  })

  it('R9, TR-9 : le 27, première dose choisie le 25 juin : le 20 mars en retard est remplacé (décision du 2026-10-12), les 25 avr. et 25 mai ne sont plus dus', () => {
    expect(next([s1, s2], lines, '2026-03-27')).toEqual([
      '2026-06-25 20:00',
      '2026-07-25 20:00',
      '2026-08-25 20:00',
    ])
    expect(read([s1, s2], lines, '2026-03-27').unlogged).toEqual([])
  })
})

describe('R2, R9 : une date choisie sur la grille en vigueur est la première échéance', () => {
  const monday = setting('m1', '2026-10-05', WEEK)
  const lines = [line('m1', 'given', '2026-10-05')]

  it('hebdo du lundi, dose du 5 donnée ; le 7, posologie, première dose choisie le lundi 19 : 19, 26', () => {
    const chosen = setting('m2', '2026-10-19', WEEK, [], { startsOn: '2026-10-07' })
    expect(next([monday, chosen], lines, '2026-10-07', 2)).toEqual(['2026-10-19', '2026-10-26'])
  })

  it('Q38 corrigé : le réglage du 6 réécrit à 9 h, première dose le lundi 19 : le 12 sort du carnet', () => {
    const corrected = setting('m2', '2026-10-19', WEEK, ['09:00'], { startsOn: '2026-10-06' })
    const reading = read([monday, corrected], lines, '2026-10-14')
    expect([reading.current, reading.unlogged]).toEqual([['2026-10-19 09:00'], []])
  })
})

describe('R9, Q-retard : un traitement fini avant la modification garde ses doses à renseigner', () => {
  it('tous les 3 mois à 20 h du 7 mars, fin le 16, dose du 7 non donnée ; le 18, sans heure, première dose le 7 juin : le 7 mars à renseigner', () => {
    const ended = setting('p1', '2026-03-07', { value: 3, unit: 'month' }, ['20:00'], {
      endsOn: '2026-03-16',
    })
    const after = setting('p2', '2026-06-07', { value: 3, unit: 'month' }, [], {
      startsOn: '2026-03-18',
      gridOriginOn: null,
    })
    const reading = read([ended, after], [], '2026-03-18')
    expect([reading.phase, reading.current, reading.unlogged]).toEqual([
      'upcoming',
      ['2026-06-07'],
      ['2026-03-07 20:00'],
    ])
  })
})

describe('R3, R9 : une date choisie se juge sur la grille en vigueur ce jour-là', () => {
  it('tous les 3 mois à 20 h, première dose le 2 avr., décalage ancré au 31 mars qui vaut à partir du 2 ; le 31, première dose choisie le 31 : 31 mars, 30 juin, 30 sept.', () => {
    const s1 = setting('s1', '2026-04-02', { value: 3, unit: 'month' }, ['20:00'], {
      startsOn: '2026-03-30',
    })
    const s2 = setting('s2', '2026-03-31', { value: 3, unit: 'month' }, ['20:00'], {
      startsOn: '2026-03-31',
    })
    const lines = [line('s1', 'shift', '2026-04-02', '20:00', '2026-03-31')]
    expect(next([s1, s2], lines, '2026-03-31')).toEqual([
      '2026-03-31 20:00',
      '2026-06-30 20:00',
      '2026-09-30 20:00',
    ])
  })
})

describe('R6, TR-9 : une date choisie fait repartir la grille, le report plus loin la suit ou est sans effet (décision du 2026-10-13)', () => {
  const p1 = setting('p1', '2026-10-02', TWO_DAYS)
  const lines = [
    line('p1', 'given', '2026-10-02'),
    line('p1', 'given', '2026-10-04'),
    line('p1', 'postponed', '2026-10-08', null, '2026-10-10'),
  ]

  it('cas A : 6 non donnée, 8 reportée au 10 ; le 7, première dose choisie le 9 : 9, 11, 13, rien à renseigner', () => {
    const p2 = setting('p2', '2026-10-09', TWO_DAYS, [], { startsOn: '2026-10-07' })
    expect(next([p1, p2], lines, '2026-10-07')).toEqual(['2026-10-09', '2026-10-11', '2026-10-13'])
    expect(read([p1, p2], lines, '2026-10-07').unlogged).toEqual([])
  })

  it('cas B : le 6, première dose choisie le 7 : 7, 9, 11', () => {
    const p2 = setting('p2', '2026-10-07', TWO_DAYS, [], { startsOn: '2026-10-06' })
    expect(next([p1, p2], lines, '2026-10-06')).toEqual(['2026-10-07', '2026-10-09', '2026-10-11'])
  })

  it('cas B suivi d’une posologie le 7 : la grille repartie reste, le report reste sans effet', () => {
    const p2 = setting('p2', '2026-10-07', TWO_DAYS, [], { startsOn: '2026-10-06' })
    const p3 = setting('p3', '2026-10-09', TWO_DAYS, [], {
      startsOn: '2026-10-07',
      gridOriginOn: null,
    })
    const given7 = [...lines, line('p2', 'given', '2026-10-07')]
    expect(next([p1, p2, p3], given7, '2026-10-07')).toEqual([
      '2026-10-09',
      '2026-10-11',
      '2026-10-13',
    ])
  })

  it('le 6, première dose choisie le 8 : le report part d’une échéance de la nouvelle grille, il la suit : 10, 12', () => {
    const p2 = setting('p2', '2026-10-08', TWO_DAYS, [], { startsOn: '2026-10-06' })
    expect(next([p1, p2], lines, '2026-10-06', 2)).toEqual(['2026-10-10', '2026-10-12'])
  })
})

describe('R6, R7 : le report qui porte la date choisie garde son effet (graines 850001702, 992000111)', () => {
  it('tous les 2 jours à 8 h et 20 h du 4 avr., posologie le 7 ; le 15, première dose choisie le 5 mai, 8 h du 24 avr. reportée au 5 mai avec décalage : le 5 mai à 8 h', () => {
    const s1 = setting('s1', '2026-04-04', TWO_DAYS, H)
    const s2 = setting('s2', '2026-04-10', TWO_DAYS, H, {
      startsOn: '2026-04-07',
      gridOriginOn: null,
    })
    const s3 = setting('s3', '2026-05-05', TWO_DAYS, H, { startsOn: '2026-04-15' })
    const lines = [
      line('s2', 'postponed', '2026-04-24', '08:00', '2026-05-05'),
      line('s2', 'shift', '2026-04-24', '08:00', '2026-05-05'),
    ]
    expect(read([s1, s2, s3], lines, '2026-04-15').current).toEqual(['2026-05-05 08:00'])
  })

  it('tous les 3 jours du 20 mars, dose du 23 reportée au 4 avr. avec décalage ; réglage du 22, première dose choisie le 4 avr. : le 4 avr., puis le 7', () => {
    const threeDays = { value: 3, unit: 'day' as const }
    const s1 = setting('s1', '2026-03-20', threeDays)
    const s2 = setting('s2', '2026-04-04', threeDays, [], { startsOn: '2026-03-22' })
    const lines = [
      line('s1', 'missed', '2026-03-20'),
      line('s1', 'postponed', '2026-03-23', null, '2026-04-04'),
      line('s2', 'shift', '2026-03-23', null, '2026-04-04'),
    ]
    expect(next([s1, s2], lines, '2026-03-26', 2)).toEqual(['2026-04-04', '2026-04-07'])
  })
})
