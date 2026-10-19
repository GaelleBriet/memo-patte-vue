// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { forksOf, type Fork } from '../../../scripts/dose-engine/two-devices'
import { constatsOf } from '../../../scripts/dose-engine/two-devices-constats'
import {
  treatmentView,
  type Line,
  type Setting,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { both, edited, moved, readings } from './dose-calendar.reglage-corrige.aides'
import { DAY, setting, WEEK } from './dose-calendar.v2.aides'

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
      ? { ...each, updatedAt: bAt }
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

  // Réécrit après le report, son réglage ne donne pas ses heures au 4, qui garde celles de sa prise :
  // 12 h y reste, le report emmène les trois doses qu'il emmenait sur A.
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

describe('#939, B plus récent : Milo, chaque semaine à 20 h depuis le 4 mars, un nouveau réglage le 6 ; la dose du 11 reportée au 12 ; A déplace la dose au 15, B choisit « Prochaine dose » le 12', () => {
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

  it('B plus récent : le report est sans effet, le 12, le 19 puis le 26', () => {
    const { merged, report } = milo({ aAt: MATIN, bAt: SOIR })
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(
      treatmentView(merged)
        .upcoming({ limit: 3 })
        .map(({ dueOn }) => dueOn),
    ).toEqual(['2026-03-12', '2026-03-19', '2026-03-26'])
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

  it('B plus récent : le report est sans effet, le 5 réclame 8 h 01, 14 h 01 et 20 h 01', () => {
    const { merged, report } = trimestre({ aAt: MATIN, bAt: SOIR })
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(states(merged, '2026-03-05', '2026-03-06')).toEqual([
      '2026-03-05 08:01 pending',
      '2026-03-05 14:01 pending',
      '2026-03-05 20:01 pending',
    ])
  })
})

describe('6b : B plus récent, le report de A est sans effet ; le décalage qu’il portait aussi', () => {
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

  it('le report et son décalage sont sans effet : la suite reprend le 6 avril à 8 h et 20 h', () => {
    const { merged, report } = troisJours({ aAt: MATIN, bAt: SOIR })
    const shift = merged.lines.find(({ status }) => status === 'shift')!
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(effectOf(merged, shift.id)).toMatchObject({ kind: 'idle' })
    expect(readings(merged)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-06 08:00'],
        aRenseigner: [],
        ensuite: ['2026-04-06 08:00', '2026-04-06 20:00', '2026-04-09 08:00'],
      }),
    )
  })
})
