// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { forksOf, type Fork } from '../../../scripts/dose-engine/two-devices'
import { constatsOf, extraDosesOf } from '../../../scripts/dose-engine/two-devices-constats'
import {
  treatmentView,
  type Line,
  type Setting,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { both, edited, moved, readings, rewrittenOn } from './dose-calendar.reglage-corrige.aides'
import { DAY, keys, setting, WEEK } from './dose-calendar.v2.aides'

// Report de A contre la réécriture d'un réglage par B (#938, #939, #882) : la plus récente des deux
// écritures l'emporte, la ligne gagnante garde son jour et son heure (décisions des 17 et 18 octobre 2026).

const MATIN = '2026-03-10T09:00:00.000Z'
const SOIR = '2026-03-10T18:00:00.000Z'
const FOUR = ['06:00', '12:00', '18:00', '23:00']

type Stamps = { aAt: string; bAt: string }

// Les lignes écrites ou réécrites par A et les réglages réécrits par B, chacun daté de son écriture.
function synchronised(
  base: TreatmentViewInput,
  parA: TreatmentViewInput,
  parB: TreatmentViewInput,
  { aAt, bAt }: Stamps,
) {
  const changed = parA.lines.filter(
    (line) => !base.lines.some((old) => old.id === line.id && old.updatedAt === line.updatedAt),
  )
  const lines = [
    ...base.lines.filter(({ id }) => !changed.some((line) => line.id === id)),
    ...changed.map((line) => ({ ...line, updatedAt: aAt })),
  ]
  const settings = parB.settings.map((each: Setting) => {
    const old = base.settings.find(({ id }) => id === each.id)
    return old !== undefined && JSON.stringify(old) !== JSON.stringify(each)
      ? rewrittenOn(old, each, bAt)
      : each
  })
  const report = changed.find(({ status }) => status === 'postponed')!
  return { merged: { ...parB, settings, lines }, report }
}

const effectOf = (input: TreatmentViewInput, id: string) =>
  treatmentView(input).history.find(({ line }) => line.id === id)!.effect

const states = (input: TreatmentViewInput, from: string, to: string) =>
  treatmentView(input)
    .slots(from, to)
    .map(({ due, state }) => `${due.dueOn} ${due.dueTime} ${state}`)

function forkAt(seed: number, step: number): Fork {
  let found: Fork | undefined
  forksOf(seed, step + 1, (fork) => {
    if (fork.step === step) found = fork
  })
  return found!
}

describe('#938 : Milo, tous les jours à 6, 12, 18 et 23 h ; la dose de 6 h du 4 mars donnée d’avance ; le 2, A reporte 12 h du 4 au 5 avec « Décaler aussi les doses suivantes », B passe à 8 h, 14 h et 20 h', () => {
  function milo(stamps: Stamps) {
    const facts = { startsOn: '2026-03-02', endsOn: '2026-03-30' }
    const s1 = setting('s1', '2026-03-04', DAY, FOUR, {
      ...facts,
      createdAt: '2026-03-01T08:00:00.000Z',
    })
    const prise: Line = {
      id: 'l1',
      settingId: 's1',
      dueOn: '2026-03-04',
      dueTime: '06:00',
      status: 'given',
      givenOn: '2026-03-02',
      targetOn: null,
      updatedAt: '2026-03-02T07:00:00.000Z',
    }
    const s2 = setting('s2', '2026-03-04', DAY, FOUR, {
      ...facts,
      gridOriginOn: null,
      firstDueChosen: false,
      createdAt: '2026-03-02T07:30:00.000Z',
    })
    const base: TreatmentViewInput = { settings: [s1, s2], lines: [prise], today: '2026-03-02' }
    const parA = moved(base, '2026-03-04', '12:00', '2026-03-05', true)
    const parB = edited(base, {
      frequency: DAY,
      times: ['08:00', '14:00', '20:00'],
      endsOn: '2026-03-30',
    })
    return synchronised(base, parA, parB, stamps)
  }

  it('B réécrit sur place le réglage du report', () => {
    const { merged } = milo({ aAt: MATIN, bAt: SOIR })
    expect(merged.settings).toHaveLength(2)
    expect(merged.settings[1]).toMatchObject({
      times: ['08:00', '14:00', '20:00'],
      updatedAt: SOIR,
    })
  })

  // #938 (18 octobre 2026) : réécrit après le report, son réglage ne donne pas ses heures au 4, qui
  // garde celles de sa prise : 12 h y reste, le report emmène les trois doses qu'il emmenait sur A.
  it('B plus récent : le 4 garde la prise de 6 h, le 5 reçoit 12 h, 18 h et 23 h, puis le 6 aux heures de B', () => {
    const { merged, report } = milo({ aAt: MATIN, bAt: SOIR })
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-03-05' })
    expect(states(merged, '2026-03-04', '2026-03-06')).toEqual([
      '2026-03-04 06:00 given',
      '2026-03-05 12:00 pending',
      '2026-03-05 18:00 pending',
      '2026-03-05 23:00 pending',
      '2026-03-06 08:00 pending',
      '2026-03-06 14:00 pending',
      '2026-03-06 20:00 pending',
    ])
    expect(readings(merged).reference).toEqual(readings(merged).moteur)
  })

  // Q5 (19 octobre 2026) : R4 dans la journée, la prise de 6 h couvre 8 h ; le report emporte le rang 2
  // à 12 h et, avec la case, le rang 3 (20 h).
  it('A plus récent : 8 h couverte par la prise de 6 h le 4, le 5 reçoit 12 h et 20 h', () => {
    const { merged, report } = milo({ aAt: SOIR, bAt: MATIN })
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-03-05' })
    expect(states(merged, '2026-03-04', '2026-03-05')).toEqual([
      '2026-03-04 08:00 covered',
      '2026-03-05 12:00 pending',
      '2026-03-05 20:00 pending',
    ])
    expect(readings(merged).reference).toEqual(readings(merged).moteur)
  })

  it('graine 9050001002, pas 7 : le report emmène 12 h, 18 h et 23 h, et le 4 ne garde que sa prise', () => {
    const fork = forkAt(9050001002, 7)
    expect(fork.aFirst).toBe(true)
    expect(states(fork.merged, '2026-03-04', '2026-03-05')).toEqual([
      '2026-03-04 06:00 given',
      '2026-03-05 12:00 pending',
      '2026-03-05 18:00 pending',
      '2026-03-05 23:00 pending',
    ])
  })
})

// Q1 (19 octobre 2026) : l'ancienne arrivée du report, le 12, est la date choisie par B : la dose du 12
// part au 15, dans les deux ordres, sans retirer d'autre échéance.
describe('#939 : Milo, chaque semaine à 20 h depuis le 4 mars, un nouveau réglage le 6 ; la dose du 11 reportée au 12 ; A déplace la dose au 15, B choisit « Prochaine dose » le 12', () => {
  function milo(stamps: Stamps) {
    const facts = { endsOn: '2026-03-28' }
    const s1 = setting('s1', '2026-03-04', WEEK, ['20:00'], {
      ...facts,
      createdAt: '2026-03-01T08:00:00.000Z',
    })
    const report: Line = {
      id: 'l1',
      settingId: 's1',
      dueOn: '2026-03-11',
      dueTime: '20:00',
      status: 'postponed',
      givenOn: null,
      targetOn: '2026-03-12',
      updatedAt: '2026-03-03T08:00:00.000Z',
    }
    const s2 = setting('s2', '2026-03-04', WEEK, ['20:00'], {
      ...facts,
      startsOn: '2026-03-06',
      gridOriginOn: null,
      firstDueChosen: false,
      createdAt: '2026-03-06T08:00:00.000Z',
    })
    const base: TreatmentViewInput = { settings: [s1, s2], lines: [report], today: '2026-03-10' }
    const parA = moved(base, '2026-03-12', '20:00', '2026-03-15', false)
    const parB = edited(base, {
      frequency: WEEK,
      times: ['20:00'],
      endsOn: '2026-03-28',
      firstDueOn: '2026-03-12',
    })
    return synchronised(base, parA, parB, stamps)
  }

  it('B réécrit le réglage du 6, plus récent que celui du report', () => {
    const { merged, report } = milo({ aAt: SOIR, bAt: MATIN })
    expect(report.settingId).toBe('s1')
    expect(merged.settings[1]).toMatchObject({
      id: 's2',
      firstDueOn: '2026-03-12',
      updatedAt: MATIN,
    })
  })

  it('la ligne de A garde son ancienne arrivée, le 12 à 20 h', () => {
    const { report } = milo({ aAt: SOIR, bAt: MATIN })
    expect(report).toMatchObject({ previousTargetOn: '2026-03-12', previousTargetTime: '20:00' })
  })

  it.each([
    ['A plus récent', { aAt: SOIR, bAt: MATIN }],
    ['B plus récent', { aAt: MATIN, bAt: SOIR }],
  ])('%s : le 15, le 19 puis le 26', (_, stamps) => {
    const { merged, report } = milo(stamps)
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-03-15' })
    expect(keys(treatmentView(merged).upcoming({ limit: 3 }))).toEqual([
      '2026-03-15 20:00',
      '2026-03-19 20:00',
      '2026-03-26 20:00',
    ])
    expect(readings(merged).reference).toEqual(readings(merged).moteur)
  })

  // Décision 1 du 19 octobre 2026 : un changement des heures seules ne rend pas le réglage de B plus
  // récent que le report de A ; la date choisie par B reste, le report aussi.
  it.each([
    [9050000090, 6],
    [9050001220, 9],
    [9050001496, 28],
    [9050001518, 18],
    [9050002324, 18],
    [9050002340, 13],
    [9050002922, 9],
  ])(
    'graine %i, pas %i : le report de A, plus récent que la grille de B, n’est pas perdu',
    (seed, step) => {
      const fork = forkAt(seed, step)
      const report = fork.phoneA.lines.find(
        (line) =>
          line.status === 'postponed' &&
          !fork.base.lines.some((old) => old.id === line.id && old.updatedAt === line.updatedAt),
      )!
      expect(effectOf(fork.merged, report.id)).toMatchObject({ kind: 'moves' })
      expect(constatsOf(fork)).toEqual([])
    },
  )

  it('graine 9050002922, pas 9 : le 15, le 19 puis le 26', () => {
    const fork = forkAt(9050002922, 9)
    expect(fork.aFirst).toBe(false)
    expect(
      treatmentView(fork.merged)
        .upcoming({ limit: 3 })
        .map(({ dueOn }) => dueOn),
    ).toEqual(['2026-03-15', '2026-03-19', '2026-03-26'])
  })
})

// Q1 (19 octobre 2026) : l'ancienne arrivée se reconnaît au jour ; sur la date choisie par B, c'est le
// rang de la dose qui part, à l'heure écrite du report.
describe('Q1 : Milo, chaque lundi à 8 h et 20 h ; la dose de 20 h du 9 mars reportée au 11 ; B choisit « Prochaine dose » le 11 à 9 h et 21 h ; A redéplace la dose du 11 au 13', () => {
  // La date choisie par B est écrite telle quelle : le planificateur la rendrait « proposée » quand elle
  // tombe sur l'arrivée du report.
  function milo({ aAt, bAt }: Stamps) {
    const s1 = setting('s1', '2026-03-02', WEEK, ['08:00', '20:00'], {
      createdAt: '2026-03-01T08:00:00.000Z',
    })
    const line = (id: string, dueTime: string, status: 'given' | 'postponed'): Line => ({
      id,
      settingId: 's1',
      dueOn: '2026-03-09',
      dueTime,
      status,
      givenOn: status === 'given' ? '2026-03-09' : null,
      targetOn: status === 'postponed' ? '2026-03-11' : null,
      ...(status === 'postponed' ? { dueRank: 2 } : {}),
      updatedAt: status === 'given' ? '2026-03-09T08:05:00.000Z' : '2026-03-09T09:00:00.000Z',
    })
    const base: TreatmentViewInput = {
      settings: [s1],
      lines: [line('l1', '08:00', 'given'), line('l2', '20:00', 'postponed')],
      today: '2026-03-10',
    }
    const parA = moved(base, '2026-03-11', '20:00', '2026-03-13', false)
    const s2 = setting('s2', '2026-03-11', WEEK, ['09:00', '21:00'], {
      startsOn: '2026-03-10',
      createdAt: bAt,
    })
    const report = { ...parA.lines.find(({ id }) => id === 'l2')!, updatedAt: aAt }
    const merged: TreatmentViewInput = {
      ...base,
      settings: [s1, s2],
      lines: [base.lines[0]!, report],
    }
    return { merged, report }
  }

  it.each([
    ['A plus récent', { aAt: SOIR, bAt: MATIN }],
    ['B plus récent', { aAt: MATIN, bAt: SOIR }],
  ])('%s : le 11 garde 9 h, le 13 reçoit la dose à 20 h, puis le 18', (_, stamps) => {
    const { merged } = milo(stamps)
    expect(keys(treatmentView(merged).upcoming({ limit: 4 }))).toEqual([
      '2026-03-11 09:00',
      '2026-03-13 20:00',
      '2026-03-18 09:00',
      '2026-03-18 21:00',
    ])
    expect(readings(merged).reference).toEqual(readings(merged).moteur)
  })
})

describe('#882, sens inverse (décision 8a) : un report plus récent dont la journée de départ est ôtée par « Prochaine dose » après la nouvelle première échéance', () => {
  it.each([
    [8710000057, 4],
    [9050000002, 18],
    [9050000318, 4],
    [9050000636, 4],
    [9050001077, 4],
  ])('graine %i, pas %i : le report de A, plus récent, n’est pas perdu', (seed, step) => {
    const fork = forkAt(seed, step)
    expect(fork.aFirst).toBe(false)
    expect(constatsOf(fork)).toEqual([])
  })
})

// Q2 (décision du 19 octobre 2026) : la note est un fait, le report de A n'a plus rien à déplacer.
describe('Q2 : un report de A plus récent battu par une note que la réécriture de B pose sur son heure', () => {
  it.each([
    [9050002175, 4, '2026-03-29'],
    [9050002204, 27, '2026-05-12'],
  ])(
    'graine %i, pas %i : la note garde sa dose du %s, le report est sans effet',
    (seed, step, day) => {
      const fork = forkAt(seed, step)
      expect(fork.aFirst).toBe(false)
      const report = fork.phoneA.lines.find(
        (line) =>
          line.status === 'postponed' &&
          !fork.base.lines.some((old) => old.id === line.id && old.updatedAt === line.updatedAt),
      )!
      expect(effectOf(fork.merged, report.id)).toEqual({ kind: 'idle', reason: 'beaten' })
      expect(states(fork.merged, day, day)).toContainEqual(
        expect.stringMatching(/20:00 (covered|given|missed)$/),
      )
    },
  )
})

// #939 : plus récent que la grille du réglage qui lit sa journée de départ, le report se lit comme
// avant : il emmène toutes ses doses, sur A comme après la synchro.
it('graine 9110001016, pas 23 : les quatre doses arrivent le 23 avril, comme sur A', () => {
  const fork = forkAt(9110001016, 23)
  const shown = (input: TreatmentViewInput) => keys(treatmentView(input).upcoming({ limit: 4 }))
  const expected = ['06:00', '12:00', '18:00', '23:00'].map((hour) => `2026-04-23 ${hour}`)
  expect(shown(fork.phoneA)).toEqual(expected)
  expect(shown(fork.merged)).toEqual(expected)
})

// #939, Q1 (b) : l'ancienne arrivée du 17 n'est plus une échéance du réglage de B, dont la grille est
// plus ancienne que le geste de A : les deux restent, le report arrive le 16.
it('graine 9130000050, pas 13 : le report de A, plus récent, arrive le 16', () => {
  const fork = forkAt(9130000050, 13)
  expect(fork.aFirst).toBe(false)
  expect(constatsOf(fork)).toEqual([])
  expect(
    treatmentView(fork.merged)
      .upcoming({ limit: 2 })
      .map(({ dueOn }) => dueOn),
  ).toEqual(['2026-04-09', '2026-04-09'])
  expect(treatmentView(fork.merged).slots('2026-04-16', '2026-04-16')).toHaveLength(1)
})

it('graine 9120001577, pas 12 : aucune dose de trop le 5 avril', () => {
  expect(constatsOf(forkAt(9120001577, 12))).toEqual([])
})

// Q2 (décision du 19 octobre 2026) : la journée de départ existe encore (la note la porte), la ligne de
// décalage, autonome, tient seule : le 30 et le 31 mars sont décalés, pas supprimés.
it('graine 9050002175, pas 4 : le décalage tient seul, la suite reprend le 1er avril', () => {
  const fork = forkAt(9050002175, 4)
  const shift = fork.merged.lines.find(({ status }) => status === 'shift')!
  expect(effectOf(fork.merged, shift.id)).toEqual({ kind: 'shifts', from: '2026-03-29' })
  expect(keys(treatmentView(fork.merged).upcoming({ limit: 2 }))).toEqual([
    '2026-04-01 20:00',
    '2026-04-02 20:00',
  ])
})

describe('6a : une heure ôtée quand la journée de départ garde une dose libre après elle, A plus récent', () => {
  // Tous les 3 mois à 8 h, 14 h et 20 h, sans prise, première dose le 5 mars ; le 3, A reporte 8 h du 5
  // au 6, B passe à 8 h 01, 14 h 01 et 20 h 01.
  function trimestre(stamps: Stamps) {
    const QUARTER = { value: 3, unit: 'month' as const }
    const s1 = setting('s1', '2026-03-05', QUARTER, ['08:00', '14:00', '20:00'], {
      startsOn: '2026-03-03',
      createdAt: '2026-03-01T08:00:00.000Z',
    })
    const base: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-03-03' }
    const parA = moved(base, '2026-03-05', '08:00', '2026-03-06', false)
    const parB = edited(base, {
      frequency: QUARTER,
      times: ['08:01', '14:01', '20:01'],
      endsOn: null,
    })
    return synchronised(base, parA, parB, stamps)
  }

  it('le report emporte son heure, le 6 à 8 h, et le 5 perd 8 h 01 : 14 h 01 et 20 h 01', () => {
    const { merged, report } = trimestre({ aAt: SOIR, bAt: MATIN })
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-03-06' })
    expect(states(merged, '2026-03-05', '2026-03-06')).toEqual([
      '2026-03-05 14:01 pending',
      '2026-03-05 20:01 pending',
      '2026-03-06 08:00 pending',
    ])
    expect(readings(merged).reference).toEqual(readings(merged).moteur)
  })

  // Q4 (19 octobre 2026) : par rang, jamais « celle qui la suit » : 8 h est le rang 1, 7 h 59 part.
  it.each([
    [
      ['07:59', '13:59', '19:59'],
      ['2026-03-05 13:59 pending', '2026-03-05 19:59 pending'],
    ],
    [['07:00', '21:00'], ['2026-03-05 21:00 pending']],
  ])(
    'B passe à %j, A plus récent : le 5 perd la dose de rang 1, le 6 reçoit 8 h',
    (times, kept) => {
      const QUARTER = { value: 3, unit: 'month' as const }
      const s1 = setting('s1', '2026-03-05', QUARTER, ['08:00', '14:00', '20:00'], {
        startsOn: '2026-03-03',
        createdAt: '2026-03-01T08:00:00.000Z',
      })
      const base: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-03-03' }
      const parA = moved(base, '2026-03-05', '08:00', '2026-03-06', false)
      const parB = edited(base, { frequency: QUARTER, times, endsOn: null })
      const { merged } = synchronised(base, parA, parB, { aAt: SOIR, bAt: MATIN })
      expect(states(merged, '2026-03-05', '2026-03-06')).toEqual([
        ...kept,
        '2026-03-06 08:00 pending',
      ])
      expect(readings(merged).reference).toEqual(readings(merged).moteur)
    },
  )

  // Décision 1 du 19 octobre 2026 : les heures seules ne rendent pas B plus récent que le report.
  it('B plus récent par l’horloge, heures seules : le report emporte aussi son heure, le 6 à 8 h', () => {
    const { merged, report } = trimestre({ aAt: MATIN, bAt: SOIR })
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-03-06' })
    expect(states(merged, '2026-03-05', '2026-03-06')).toEqual([
      '2026-03-05 14:01 pending',
      '2026-03-05 20:01 pending',
      '2026-03-06 08:00 pending',
    ])
    expect(readings(merged).reference).toEqual(readings(merged).moteur)
  })
})

describe('Carnet de #883 : B ne change que les heures ; le report de A et son décalage tiennent, dans les deux ordres', () => {
  // Carnet de #883 (graine 8710000013) : tous les 3 jours à 8 h, 14 h et 20 h depuis le 3 avril, fin le
  // 28 mai ; le 3, 8 h oubliée et 20 h donnée d'avance ; A reporte 14 h au 6 mai avec la case, B passe à
  // 8 h et 20 h.
  function troisJours(stamps: Stamps) {
    const THREE_DAYS = { value: 3, unit: 'day' as const }
    const HOURS = ['08:00', '14:00', '20:00']
    const facts = { endsOn: '2026-05-28', createdAt: '2026-04-01T08:00:00.000Z' }
    const s1 = setting('s1', '2026-04-03', THREE_DAYS, HOURS, facts)
    const note = (id: string, dueTime: string, status: 'given' | 'missed', updatedAt: string) => ({
      id,
      settingId: 's1',
      dueOn: '2026-04-03',
      dueTime,
      status,
      givenOn: status === 'given' ? '2026-04-01' : null,
      targetOn: null,
      updatedAt,
    })
    const s2 = setting('s2', '2026-04-03', THREE_DAYS, HOURS, {
      ...facts,
      gridOriginOn: null,
      firstDueChosen: false,
      createdAt: '2026-04-02T08:00:00.000Z',
    })
    const base: TreatmentViewInput = {
      settings: [s1, s2],
      lines: [
        note('l1', '08:00', 'missed', '2026-04-01T09:00:00.000Z'),
        note('l2', '20:00', 'given', '2026-04-01T10:00:00.000Z'),
      ],
      today: '2026-04-03',
    }
    const parA = moved(base, '2026-04-03', '14:00', '2026-05-06', true)
    const parB = edited(base, {
      frequency: THREE_DAYS,
      times: ['08:00', '20:00'],
      endsOn: '2026-05-28',
    })
    return synchronised(base, parA, parB, {
      aAt: stamps.aAt.replace('03-10', '04-03'),
      bAt: stamps.bAt.replace('03-10', '04-03'),
    })
  }

  // Décision 1 du 19 octobre 2026 : un report n'entre jamais en conflit avec les heures ; 6b ne vaut
  // que quand la journée de départ sort de la grille.
  it.each([
    ['B plus récent', { aAt: MATIN, bAt: SOIR }],
    ['A plus récent', { aAt: SOIR, bAt: MATIN }],
  ])('%s : le 6 mai à 14 h, puis le 9 mai à 8 h et 20 h', (_, stamps) => {
    const { merged, report } = troisJours(stamps)
    const shift = merged.lines.find(({ status }) => status === 'shift')!
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-05-06' })
    expect(effectOf(merged, shift.id)).toEqual({ kind: 'shifts', from: '2026-04-03' })
    expect(readings(merged)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-05-06 14:00'],
        aRenseigner: [],
        ensuite: ['2026-05-06 14:00', '2026-05-09 08:00', '2026-05-09 20:00'],
      }),
    )
  })
})

// Décisions du 20 octobre 2026 : la dose du report apparaît une fois ; départ et arrivée comptent
// autant de doses que le réglage en vigueur a d'heures ; une prise posée ailleurs par R4 ne garde pas
// le rang du report, elle se repose sur les doses qu'il laisse.
describe('Report par rang, compté en doses (20 octobre 2026)', () => {
  const shown = (fork: Fork, from: string, to: string) => states(fork.merged, from, to)

  it('graine 9150002037, pas 4 : le 20 mars 8 h couverte, le 30 mars 12 h et 20 h', () => {
    const fork = forkAt(9150002037, 4)
    expect(shown(fork, '2026-03-20', '2026-03-30')).toEqual([
      '2026-03-20 08:00 covered',
      '2026-03-30 12:00 pending',
      '2026-03-30 20:00 pending',
    ])
    expect(extraDosesOf(fork)).toEqual([])
    expect(constatsOf(fork)).toEqual([])
  })

  it('graine 9140000270, pas 25 : le 13 avril 6 h couverte, le 15 avril 18 h, 20 h et 23 h', () => {
    const fork = forkAt(9140000270, 25)
    expect(shown(fork, '2026-04-13', '2026-04-15')).toEqual([
      '2026-04-13 06:00 covered',
      '2026-04-15 18:00 pending',
      '2026-04-15 20:00 pending',
      '2026-04-15 23:00 pending',
    ])
    expect(extraDosesOf(fork)).toEqual([])
    expect(constatsOf(fork)).toEqual([])
  })

  it('graine 9150002829, pas 5 : le 11 mars ne garde que 6 h, couverte par la prise de 8 h ; le 14 mars reçoit 18 h, 20 h et 23 h', () => {
    const fork = forkAt(9150002829, 5)
    expect(shown(fork, '2026-03-11', '2026-03-11')).toEqual(['2026-03-11 06:00 covered'])
    expect(shown(fork, '2026-03-14', '2026-03-14')).toEqual([
      '2026-03-14 18:00 pending',
      '2026-03-14 20:00 pending',
      '2026-03-14 23:00 pending',
    ])
    expect(extraDosesOf(fork)).toEqual([])
    expect(constatsOf(fork)).toEqual([])
  })

  // Le constat compte les heures du réglage en vigueur au départ, pas celles du dernier réglage créé.
  it('graine 9050000373, pas 8 : départ et arrivée ne comptent pas plus de doses que le réglage en vigueur n’a d’heures', () => {
    expect(extraDosesOf(forkAt(9050000373, 8))).toEqual([])
  })

  // R9 : avancée avec la case, la dose de la date choisie fait de son arrivée le premier jour de la
  // série ; le 1er avril reçoit la dose du 30 mars à 20 h, aucune heure du réglage de B.
  it('graine 9140001597, pas 17 : le 1er avril à 20 h, puis le 2, le 3…', () => {
    const fork = forkAt(9140001597, 17)
    expect(keys(treatmentView(fork.phoneA).upcoming({ limit: 3 }))).toEqual([
      '2026-04-01 20:00',
      '2026-04-02',
      '2026-04-03',
    ])
    expect(shown(fork, '2026-04-01', '2026-04-02')).toEqual([
      '2026-04-01 20:00 pending',
      '2026-04-02 08:00 pending',
      '2026-04-02 14:00 pending',
      '2026-04-02 20:00 pending',
    ])
    expect(extraDosesOf(fork)).toEqual([])
    expect(constatsOf(fork)).toEqual([])
  })

  // R8 : la fin posée par B arrête le traitement avant l'arrivée ; le report est sans effet.
  it.each([
    [9050002774, 11],
    [9140002364, 21],
  ])('graine %i, pas %i : fin avant l’arrivée, le report est sans effet', (seed, step) => {
    const fork = forkAt(seed, step)
    const report = fork.phoneA.lines.find(
      (line) =>
        line.status === 'postponed' &&
        !fork.base.lines.some((old) => old.id === line.id && old.updatedAt === line.updatedAt),
    )!
    expect(effectOf(fork.merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(constatsOf(fork)).toEqual([])
  })
})
