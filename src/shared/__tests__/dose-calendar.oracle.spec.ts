// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { treatmentView, viewInputOf, type LegacyInput } from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { gapsBetween, type Display } from '../../../scripts/dose-engine/display'
import { oracleConfig, runOracle } from '../../../scripts/dose-engine/oracle'
import { displayOf, horizonOf } from '../../../scripts/dose-engine/v2-reading'
import { naive } from '../../../scripts/dose-engine/v2-invariants-readings'

// Séries longues, hors `vitest run` : voir scripts/dose-engine/README.md (ORACLE_FROM, ORACLE_SEEDS,
// ORACLE_STEPS).
const config = oracleConfig(process.env)
const TIMEOUT = 60_000 + config.seeds * config.steps * 20

// Carnets menés par l'ancien moteur, supprimé depuis, à chaque pas de la graine : `actuel` est ce
// qu'il en montrait.
type Frozen = { seed: number; book: LegacyInput; actuel: Display }
const FROZEN: Frozen[] = readFileSync(
  new URL('./fixtures/dose-calendar-oracle-graines.jsonl', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))

const statesOf = (seed: number) => FROZEN.filter((state) => state.seed === seed)

describe('oracle du moteur v2 contre le modèle de référence naïf', { timeout: 60_000 }, () => {
  it(
    'le moteur v2 lit chaque carnet comme le modèle de référence',
    () => {
      const run = runOracle(config)
      console.warn(run.summary)
      expect(run.carnets).toBe(config.seeds)
      expect(run.gestures).toBeGreaterThan(config.seeds)
      expect(run.divergences.slice(0, 3)).toEqual([])
    },
    TIMEOUT,
  )

  it.each([570005085, 570012998])(
    'carnets de l’ancien moteur, graine %i : même lecture à chaque pas (réglage de même fréquence parti d’un jour d’arrivée)',
    (seed) => {
      const states = statesOf(seed)
      expect(states.length).toBeGreaterThan(20)
      expect(states.map(({ book }) => naive(viewInputOf(book)))).toEqual(states.map(() => null))
    },
  )

  it('carnets de l’ancien moteur, graine 570010320 : un réglage de même fréquence fait avant la première dose garde la grille sans la faire repartir plus tôt (R3, décision du 2026-10-11)', () => {
    const states = statesOf(570010320)
    const v2 = (book: LegacyInput) => {
      const input = viewInputOf(book)
      return displayOf(treatmentView(input), horizonOf(input))
    }
    expect(states.length).toBeGreaterThan(20)
    expect(states.map(({ book, actuel }) => gapsBetween(actuel, v2(book)))).toEqual(
      states.map(() => []),
    )
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
      updatedAt: `2026-01-01T00:00:0${at}.000Z`,
    })
    const doses = [
      dose('2026-10-01', '08:00', 'given', 1),
      dose('2026-10-01', '20:00', 'given', 2),
      dose('2026-10-03', '08:00', 'given', 3),
      dose('2026-10-03', '20:00', 'postponed', 4),
    ]
    const bookOf = (changedOn: string, extra: typeof doses = []): LegacyInput => ({
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
    const until = '2026-10-07'
    const both = (book: LegacyInput) => {
      const input = viewInputOf(book)
      return [referenceReading({ ...input, until }), displayOf(treatmentView(input), until)].map(
        ({ current, upcoming }) =>
          [...current, ...upcoming].filter((key, i, all) => all.indexOf(key) === i),
      )
    }

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
    ['ORACLE_ENGINES', 'actuel,v2'],
    ['ORACLE_SETTINGS', 'avec'],
    ['ORACLE_FILTER', 'v2'],
    ['ORACLE_OUT', '/tmp/oracle'],
  ])('un réglage illisible ou retiré arrête l’oracle avant tout carnet : %s=%s', (name, value) => {
    expect(() => oracleConfig({ [name]: value })).toThrow(/^Oracle illisible/)
  })
})
