// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { FAMILIES } from '../../../scripts/dose-engine/ecarts'
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

describe('oracle des moteurs de doses', () => {
  it(
    'les écarts entre les deux moteurs sont tous rattachés à un ticket ou à une décision',
    () => {
      const run = runOracle(config)
      console.warn(run.summary)
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
    ['ORACLE_SEEDS', 'mille'],
    ['ORACLE_FROM', '-3'],
    ['ORACLE_STEPS', '2.5'],
    ['ORACLE_ENGINES', 'actuel'],
    ['ORACLE_ENGINES', 'actuel,v3'],
    ['ORACLE_SETTINGS', 'parfois'],
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
