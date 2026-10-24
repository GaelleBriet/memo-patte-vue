import { naive } from './v2-invariants-readings'
import { ONE_PHONE_GESTURES, startV2Walk, v2Step } from './v2-walk'

export type OracleConfig = { from: number; seeds: number; steps: number }

export type OracleRun = {
  config: OracleConfig
  carnets: number
  gestures: number
  /** Premier écart de chaque graine qui diverge, avec le carnet et les gestes joués. */
  divergences: string[]
  summary: string
}

const REMOVED = ['ORACLE_SETTINGS', 'ORACLE_FILTER', 'ORACLE_OUT']

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Oracle illisible : ${name}=${raw}`)
  return value
}

/** Réglages lus dans l'environnement ; un réglage illisible ou retiré arrête l'oracle avant tout carnet. */
export function oracleConfig(env: Record<string, string | undefined>): OracleConfig {
  const engines = env.ORACLE_ENGINES ?? 'reference,v2'
  if (engines !== 'reference,v2') throw new Error(`Oracle illisible : ORACLE_ENGINES=${engines}`)
  const removed = REMOVED.find((name) => env[name] !== undefined)
  if (removed !== undefined) throw new Error(`Oracle illisible : ${removed} n'existe plus`)
  return {
    from: positiveInteger('ORACLE_FROM', env.ORACLE_FROM, 530_000_000),
    seeds: positiveInteger('ORACLE_SEEDS', env.ORACLE_SEEDS, 50),
    steps: positiveInteger('ORACLE_STEPS', env.ORACLE_STEPS, 24),
  }
}

function playCarnet(config: OracleConfig, seed: number, run: OracleRun): string | null {
  const walk = startV2Walk(seed, ONE_PHONE_GESTURES)
  const first = naive(walk.input)
  if (first !== null) return `graine ${seed}, création : ${first.detail}`
  let divergence: string | null = null
  for (let count = 0; count < config.steps && divergence === null; count += 1) {
    v2Step(walk, ({ label, before, after }) => {
      run.gestures += 1
      const broken = naive(after)
      if (broken === null) return
      divergence =
        `graine ${seed}, ${label} : ${broken.detail}\n` +
        `carnet avant le geste : ${JSON.stringify(before)}\ngestes : ${walk.log.join(' | ')}`
    })
  }
  return divergence
}

/** Le moteur v2 contre le modèle de référence naïf, sur des carnets menés par les gestes de v2. */
export function runOracle(config: OracleConfig): OracleRun {
  const last = config.from + config.seeds - 1
  const run: OracleRun = { config, carnets: 0, gestures: 0, divergences: [], summary: '' }
  for (let seed = config.from; seed <= last; seed += 1) {
    run.carnets += 1
    const divergence = playCarnet(config, seed, run)
    if (divergence !== null) run.divergences.push(divergence)
  }
  run.summary =
    `Oracle : ${run.carnets} carnets × ${config.steps} gestes, graines ${config.from} à ${last}` +
    ` (reference contre v2) : ${run.gestures} gestes comparés, ${run.divergences.length} écarts`
  return run
}
