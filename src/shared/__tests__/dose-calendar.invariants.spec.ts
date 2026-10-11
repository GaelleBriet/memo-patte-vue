// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../../scripts/dose-engine/carnet'
import { brokenBy } from '../../../scripts/dose-engine/v2-invariants'
import { startV2Walk, v2Step, type V2Step } from '../../../scripts/dose-engine/v2-walk'

// Campagne d'invariants du moteur v2 (plan §6.3) : des carnets menés par les gestes de v2, huit
// invariants vérifiés à chaque pas, horizon en jours, aucune exemption. Séries longues : variables
// INVARIANTS_FROM, INVARIANTS_SEEDS, INVARIANTS_STEPS posées directement devant la commande
// (`.claude/rules/outils-de-test.md`).

type Campaign = { from: number; seeds: number; steps: number }

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Campagne illisible : ${name}=${raw}`)
  return value
}

export function campaignOf(env: Record<string, string | undefined>): Campaign {
  return {
    from: positiveInteger('INVARIANTS_FROM', env.INVARIANTS_FROM, 620_000_000),
    seeds: positiveInteger('INVARIANTS_SEEDS', env.INVARIANTS_SEEDS, 25),
    steps: positiveInteger('INVARIANTS_STEPS', env.INVARIANTS_STEPS, 24),
  }
}

type Played = {
  carnets: number
  steps: number
  failures: string[]
  byInvariant: Record<string, number>
}

function playCampaign({ from, seeds, steps }: Campaign): Played {
  const played: Played = { carnets: 0, steps: 0, failures: [], byInvariant: {} }
  for (let seed = from; seed < from + seeds; seed += 1) {
    const walk = startV2Walk(seed)
    const checks = mulberry32(seed ^ 0x4f1bbcdc)
    let failure: string | null = null
    const onStep = (step: V2Step) => {
      played.steps += 1
      if (failure !== null) return
      const broken = brokenBy(step, checks)
      if (broken === null) return
      const name = broken.invariant.replace(/ \(.*$/, '')
      played.byInvariant[name] = (played.byInvariant[name] ?? 0) + 1
      failure =
        `graine ${seed}, ${step.label} : ${broken.invariant}\n${broken.detail}\n` +
        `carnet avant le geste : ${JSON.stringify(step.before)}\n` +
        `gestes : ${walk.log.join(' | ')}`
    }
    for (let count = 0; count < steps && failure === null; count += 1) v2Step(walk, onStep)
    played.carnets += 1
    if (failure !== null) played.failures.push(failure)
  }
  return played
}

const campaign = campaignOf(process.env)

describe('campagne d’invariants du moteur v2', () => {
  it(
    'les huit invariants tiennent à chaque geste',
    () => {
      const played = playCampaign(campaign)
      const last = campaign.from + campaign.seeds - 1
      console.warn(
        `Campagne : ${played.carnets} carnets × ${campaign.steps} gestes, graines ${campaign.from} à ${last}` +
          ` : ${played.steps} pas vérifiés, ${played.failures.length} carnets en échec` +
          Object.entries(played.byInvariant)
            .map(([name, count]) => ` ; ${name} ${count}`)
            .join(''),
      )
      expect(played.carnets).toBe(campaign.seeds)
      expect(played.steps).toBeGreaterThan(campaign.seeds)
      expect(played.failures.slice(0, 3)).toEqual([])
    },
    60_000 + campaign.seeds * campaign.steps * 40,
  )

  it.each([
    ['INVARIANTS_SEEDS', 'mille'],
    ['INVARIANTS_FROM', '-3'],
    ['INVARIANTS_STEPS', '2.5'],
  ])('un réglage illisible arrête la campagne avant tout carnet : %s=%s', (name, value) => {
    expect(() => campaignOf({ [name]: value })).toThrow(/^Campagne illisible/)
  })
})
