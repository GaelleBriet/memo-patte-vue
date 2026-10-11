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
    expect(read([p1, p2], lines, '2026-10-02').current).toEqual(['2026-10-03 08:00'])
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
