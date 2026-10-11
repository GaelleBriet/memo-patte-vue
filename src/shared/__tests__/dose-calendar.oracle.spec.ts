// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Book } from '../../../scripts/dose-engine/carnet'
import { FAMILIES, verdictOf } from '../../../scripts/dose-engine/ecarts'
import {
  currentEngine,
  readWith,
  referenceEngine,
  v2Engine,
} from '../../../scripts/dose-engine/engines'
import { oracleConfig, runOracle, type OracleRun } from '../../../scripts/dose-engine/oracle'

// Séries longues, hors `vitest run` : voir scripts/dose-engine/README.md (ORACLE_FROM, ORACLE_SEEDS,
// ORACLE_STEPS, ORACLE_ENGINES, ORACLE_SETTINGS, ORACLE_OUT).
const config = oracleConfig(process.env)
const TIMEOUT = 60_000 + config.seeds * config.steps * 20
const SANS_SETTINGS: readonly string[] = ['prise-orpheline', 'lignes-sans-effet']

function report(run: OracleRun): string[] {
  return run.unaccepted.map(
    ({ seed, gesture, verdict, gaps }) =>
      `graine ${seed}, ${gesture} : ${verdict.families.join(', ') || 'aucune famille'} ; ` +
      `inexpliqué ${verdict.unexplained.join(', ')} ; ${JSON.stringify(gaps)}`,
  )
}

describe('oracle des moteurs de doses', { timeout: 60_000 }, () => {
  it(
    'les écarts entre les deux moteurs sont tous rattachés à un ticket ou à une décision',
    () => {
      const run = runOracle(config)
      console.warn(run.summary)
      for (const [kind, { examples }] of Object.entries(run.suspects)) {
        console.warn(`${kind} :\n  ${examples.join('\n  ')}`)
      }
      expect(run.carnets).toBe(config.seeds)
      expect(report(run)).toEqual([])
    },
    TIMEOUT,
  )

  it('le moteur actuel contre lui-même : aucun écart, réglages changés compris', () => {
    const run = runOracle({ ...oracleConfig({ ORACLE_ENGINES: 'actuel,actuel' }), seeds: 50 })
    expect(run.summary).toMatch(/^Oracle : 50 carnets × 24 gestes, graines 530000000 à 530000049/)
    expect(run.gestures).toBeGreaterThan(500)
    expect(run.divergences).toEqual([])
  })

  it('le modèle de référence contre le moteur actuel, sans changement de réglage : prises sorties du calendrier et lignes sans effet seules (R4, R11)', () => {
    const run = runOracle(
      oracleConfig({ ORACLE_ENGINES: 'actuel,reference', ORACLE_SETTINGS: 'sans' }),
    )
    const families = run.divergences.flatMap(({ verdict }) => verdict.families)
    expect(report(run)).toEqual([])
    expect(families.filter((family) => !SANS_SETTINGS.includes(family))).toEqual([])
  })

  it('le modèle de référence contre le moteur actuel, réglages changés : écarts rattachés', () => {
    const run = runOracle(oracleConfig({ ORACLE_ENGINES: 'actuel,reference' }))
    expect(run.divergences.length).toBeGreaterThan(0)
    expect(report(run)).toEqual([])
  })

  it.each([
    [550000279, 'prise-orpheline'],
    [550048773, 'prise-orpheline'],
    [550140965, 'prise-orpheline'],
    [550123096, 'reports-en-boucle'],
    [550248567, 'prise-orpheline'],
    [550250118, 'prise-orpheline'],
  ])(
    'moteur v2, sans changement de réglage ni filtre : la graine %i est rattachée à %s',
    (seed, family) => {
      const run = runOracle(
        oracleConfig({
          ORACLE_ENGINES: 'actuel,v2',
          ORACLE_SETTINGS: 'sans',
          ORACLE_FILTER: 'aucun',
          ORACLE_FROM: String(seed),
          ORACLE_SEEDS: '1',
          ORACLE_STEPS: '40',
        }),
      )
      expect(run.divergences.flatMap(({ verdict }) => verdict.families)).toContain(family)
      expect(report(run)).toEqual([])
    },
  )

  it.each([
    [560001008, 'reglage-meme-frequence'],
    [560003279, 'reglage-meme-frequence'],
    [570002709, 'prise-orpheline'],
    [570015902, 'prise-orpheline'],
  ])(
    'moteur v2, réglages changés, sans filtre : la graine %i est rattachée à %s',
    (seed, family) => {
      const run = runOracle(
        oracleConfig({
          ORACLE_ENGINES: 'actuel,v2',
          ORACLE_FILTER: 'aucun',
          ORACLE_FROM: String(seed),
          ORACLE_SEEDS: '1',
          ORACLE_STEPS: '40',
        }),
      )
      expect(run.divergences.flatMap(({ verdict }) => verdict.families)).toContain(family)
      expect(report(run)).toEqual([])
    },
  )

  it.each([
    [550248567, 'sans'],
    [550250118, 'sans'],
    [600018106, 'avec'],
    [600014163, 'avec'],
    [600014274, 'avec'],
    [580001079, 'avec'],
    [580011308, 'avec'],
    [580038853, 'avec'],
  ])(
    'carnet inatteignable, gestes refusés par v2 non joués : la graine %i ne laisse aucun écart non rattaché',
    (seed, settings) => {
      const run = runOracle(
        oracleConfig({
          ORACLE_ENGINES: 'actuel,v2',
          ORACLE_SETTINGS: settings,
          ORACLE_FROM: String(seed),
          ORACLE_SEEDS: '1',
          ORACLE_STEPS: '40',
        }),
      )
      expect(report(run)).toEqual([])
    },
  )

  it('graine 570010320 : un réglage de même fréquence fait avant la première dose garde la grille sans la faire repartir plus tôt (R3, décision du 2026-10-11)', () => {
    const run = runOracle(
      oracleConfig({
        ORACLE_ENGINES: 'actuel,v2',
        ORACLE_FILTER: 'aucun',
        ORACLE_FROM: '570010320',
        ORACLE_SEEDS: '1',
        ORACLE_STEPS: '40',
      }),
    )
    expect(run.divergences).toEqual([])
  })

  it.each([570005085, 570012998])(
    'modèle de référence et moteur v2 : même lecture de la graine %i (réglage de même fréquence parti d’un jour d’arrivée)',
    (seed) => {
      const run = runOracle(
        oracleConfig({
          ORACLE_ENGINES: 'reference,v2',
          ORACLE_FROM: String(seed),
          ORACLE_SEEDS: '1',
          ORACLE_STEPS: '40',
        }),
      )
      expect(run.divergences).toEqual([])
    },
  )

  it('une prise du jour où son réglage cède la place n’est pas une prise orpheline (R1, R4)', () => {
    const period = {
      endsOn: null,
      stoppedOn: null,
      times: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const dose = { dueTime: null, status: 'given' as const, updatedAt: '2026-01-01T00:00:01.000Z' }
    const book: Book = {
      today: '2026-10-05',
      periods: [
        {
          ...period,
          id: 'p1',
          startsOn: '2026-09-05',
          firstDueOn: '2026-09-05',
          referenceOn: '2026-09-05',
          frequency: { value: 1, unit: 'month' },
        },
        {
          ...period,
          id: 'p2',
          startsOn: '2026-10-05',
          firstDueOn: '2026-10-12',
          referenceOn: '2026-10-12',
          frequency: { value: 1, unit: 'week' },
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      doses: ['2026-09-05', '2026-10-05'].map((day) => ({
        ...dose,
        id: day,
        periodId: 'p1',
        dueOn: day,
        givenOn: day,
        nextDueDate: day,
        createdAt: dose.updatedAt,
      })),
    }
    const actual = readWith(currentEngine, book)
    if ('error' in actual) throw new Error(actual.error)
    expect(actual.current).toEqual(['2026-10-12'])
    const upcoming = actual.upcoming.filter((key) => key !== '2026-10-12')
    const skipped = { ...actual, current: upcoming.slice(0, 1), upcoming }
    const reread = (carnet: Book, until: string) => readWith(v2Engine, carnet, until)
    expect(verdictOf(book, actual, skipped, reread).unexplained).toContain('2026-10-12')
  })

  describe('R7, R9.2, R11 : tous les 2 jours à 8 h et 20 h, 20 h du 3 reportée au 4, tous les 3 jours à partir du 4', () => {
    const period = { endsOn: null, stoppedOn: null, times: ['08:00', '20:00'] }
    const p1 = {
      ...period,
      id: 'p1',
      startsOn: '2026-10-01',
      firstDueOn: '2026-10-01',
      referenceOn: '2026-10-01',
      frequency: { value: 2, unit: 'day' as const },
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const dose = (dueOn: string, dueTime: string, status: 'given' | 'postponed', at: number) => ({
      id: `${dueOn} ${dueTime} ${status}`,
      periodId: 'p1',
      dueOn,
      dueTime,
      status,
      givenOn: status === 'given' ? dueOn : null,
      nextDueDate: status === 'given' ? '2026-10-03' : '2026-10-04',
      createdAt: `2026-01-01T00:00:0${at}.000Z`,
      updatedAt: `2026-01-01T00:00:0${at}.000Z`,
    })
    const doses = [
      dose('2026-10-01', '08:00', 'given', 1),
      dose('2026-10-01', '20:00', 'given', 2),
      dose('2026-10-03', '08:00', 'given', 3),
      dose('2026-10-03', '20:00', 'postponed', 4),
    ]
    const bookOf = (changedOn: string, extra: typeof doses = []): Book => ({
      today: '2026-10-04',
      periods: [
        p1,
        {
          ...p1,
          id: 'p2',
          startsOn: changedOn,
          firstDueOn: '2026-10-04',
          referenceOn: '2026-10-04',
          frequency: { value: 3, unit: 'day' },
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      doses: [...doses, ...extra],
    })
    const both = (book: Book) =>
      [referenceEngine, v2Engine].map((engine) => {
        const reading = readWith(engine, book, '2026-10-07')
        if ('error' in reading) throw new Error(reading.error)
        return [...reading.current, ...reading.upcoming].filter(
          (key, i, all) => all.indexOf(key) === i,
        )
      })

    it.each(['2026-10-03', '2026-10-04'])(
      'réglage changé le %s : le 4 ne reçoit que 20 h',
      (changedOn) => {
        const expected = ['2026-10-04 20:00', '2026-10-07 08:00', '2026-10-07 20:00']
        expect(both(bookOf(changedOn))).toEqual([expected, expected])
      },
    )

    it('20 h du 3 donnée sur un autre appareil, report sans effet : 8 h et 20 h le 4', () => {
      const book = bookOf('2026-10-04', [dose('2026-10-03', '20:00', 'given', 5)])
      const expected = [
        '2026-10-04 08:00',
        '2026-10-04 20:00',
        '2026-10-07 08:00',
        '2026-10-07 20:00',
      ]
      expect(both(book)).toEqual([expected, expected])
    })
  })

  it.each([
    ['ORACLE_SEEDS', 'mille'],
    ['ORACLE_FROM', '-3'],
    ['ORACLE_STEPS', '2.5'],
    ['ORACLE_ENGINES', 'actuel'],
    ['ORACLE_ENGINES', 'actuel,v3'],
    ['ORACLE_SETTINGS', 'parfois'],
    ['ORACLE_FILTER', 'v3'],
  ])('un réglage illisible arrête l’oracle avant tout carnet : %s=%s', (name, value) => {
    expect(() => oracleConfig({ [name]: value })).toThrow(/^Oracle illisible/)
  })

  it('ecarts-acceptes.md décrit chaque famille, une fois', () => {
    const text = readFileSync(
      new URL('../../../scripts/dose-engine/ecarts-acceptes.md', import.meta.url),
      'utf8',
    )
    const listed = [...text.matchAll(/^\| famille `([a-z0-9-]+)`/gm)].map(([, family]) => family)
    expect(listed.sort()).toEqual(Object.keys(FAMILIES).sort())
  })
})
