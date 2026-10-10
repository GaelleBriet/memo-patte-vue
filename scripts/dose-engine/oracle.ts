import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Book } from './carnet'
import { gapsBetween, type Gap, type Reading } from './display'
import { verdictOf, type Family, type Verdict } from './ecarts'
import { ENGINES, readWith, type Engine } from './engines'
import { step } from './walk'
import { keptBook, startWalk, WalkStopped, type SettingsMode } from './walk-state'

export type OracleConfig = {
  from: number
  seeds: number
  steps: number
  engines: [Engine, Engine]
  settings: SettingsMode
  out: string | null
}

/** Premier geste où les deux moteurs ne montrent plus la même chose, et le carnet juste avant lui. */
export type Divergence = {
  seed: number
  gesture: string
  log: string[]
  before: Book
  after: Book
  readings: [Reading, Reading]
  gaps: Gap[]
  verdict: Verdict
}

export type OracleRun = {
  config: OracleConfig
  carnets: number
  gestures: number
  stopped: { seed: number; reason: string }[]
  divergences: Divergence[]
  /** Écarts que ni un ticket ni une décision n'expliquent : ils bloquent. */
  unaccepted: Divergence[]
  families: Partial<Record<Family, number>>
  summary: string
}

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Oracle illisible : ${name}=${raw}`)
  return value
}

/** Réglages lus dans l'environnement ; un réglage illisible arrête l'oracle avant tout carnet. */
export function oracleConfig(env: Record<string, string | undefined>): OracleConfig {
  const names = (env.ORACLE_ENGINES ?? 'actuel,actuel').split(',')
  const engines = names.map((name) => ENGINES[name])
  if (engines.length !== 2 || engines.some((engine) => engine === undefined)) {
    throw new Error(`Oracle illisible : ORACLE_ENGINES=${env.ORACLE_ENGINES}`)
  }
  const settings = env.ORACLE_SETTINGS ?? 'avec'
  if (settings !== 'avec' && settings !== 'sans') {
    throw new Error(`Oracle illisible : ORACLE_SETTINGS=${settings}`)
  }
  return {
    from: positiveInteger('ORACLE_FROM', env.ORACLE_FROM, 530_000_000),
    seeds: positiveInteger('ORACLE_SEEDS', env.ORACLE_SEEDS, 50),
    steps: positiveInteger('ORACLE_STEPS', env.ORACLE_STEPS, 24),
    engines: engines as [Engine, Engine],
    settings,
    out: env.ORACLE_OUT ?? null,
  }
}

function compared(config: OracleConfig, book: Book): [Reading, Reading, Gap[]] {
  const [a, b] = config.engines.map((engine) => readWith(engine, book)) as [Reading, Reading]
  return [a, b, gapsBetween(a, b)]
}

function playCarnet(config: OracleConfig, seed: number, run: OracleRun): Divergence | undefined {
  const walk = startWalk(seed, config.settings)
  let divergence: Divergence | undefined
  const check = (before: Book, gesture: string) => {
    if (divergence !== undefined) return
    run.gestures += 1
    const after = keptBook(walk)
    const [a, b, gaps] = compared(config, after)
    if (gaps.length > 0) {
      const verdict =
        config.engines[0].name === 'actuel'
          ? verdictOf(after, a, b)
          : { families: [], unexplained: ['sans le moteur actuel en premier'], accepted: false }
      divergence = {
        seed,
        gesture,
        log: [...walk.log],
        before,
        after,
        readings: [a, b],
        gaps,
        verdict,
      }
    }
  }
  check(walk.book, 'création')
  try {
    for (let count = 0; count < config.steps && divergence === undefined; count += 1) {
      step(walk, (before) => check(before, walk.log.at(-1) ?? 'geste'))
    }
  } catch (error) {
    if (!(error instanceof WalkStopped)) throw error
    run.stopped.push({ seed, reason: error.message })
  }
  return divergence
}

function written(out: string, divergence: Divergence): void {
  mkdirSync(out, { recursive: true })
  const { seed, gesture, log, before, after, readings, gaps, verdict } = divergence
  const content = { seed, gesture, verdict, log, ...before, after, readings, gaps }
  writeFileSync(join(out, `avant-${seed}.json`), `${JSON.stringify(content, null, 2)}\n`)
}

export function runOracle(config: OracleConfig): OracleRun {
  const last = config.from + config.seeds - 1
  const [a, b] = config.engines
  const run: OracleRun = {
    config,
    carnets: 0,
    gestures: 0,
    stopped: [],
    divergences: [],
    unaccepted: [],
    families: {},
    summary: '',
  }
  for (let seed = config.from; seed <= last; seed += 1) {
    run.carnets += 1
    const divergence = playCarnet(config, seed, run)
    if (divergence === undefined) continue
    run.divergences.push(divergence)
    for (const family of divergence.verdict.families) {
      run.families[family] = (run.families[family] ?? 0) + 1
    }
    if (!divergence.verdict.accepted) run.unaccepted.push(divergence)
    if (config.out !== null) written(config.out, divergence)
  }
  const families = Object.entries(run.families)
    .map(([family, count]) => `${family} ${count}`)
    .join(', ')
  run.summary =
    `Oracle : ${run.carnets} carnets × ${config.steps} gestes, graines ${config.from} à ${last}` +
    ` (${a.name} contre ${b.name}, réglages ${config.settings}) : ${run.gestures} gestes comparés,` +
    ` ${run.divergences.length} écarts dont ${run.unaccepted.length} non rattachés,` +
    ` ${run.stopped.length} carnets arrêtés${families === '' ? '' : ` ; familles : ${families}`}`
  return run
}
