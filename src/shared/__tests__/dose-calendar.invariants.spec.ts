// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../../scripts/dose-engine/carnet'
import { brokenBy } from '../../../scripts/dose-engine/v2-invariants'
import { noDoseAdded } from '../../../scripts/dose-engine/v2-invariants-count'
import { movedArrives } from '../../../scripts/dose-engine/v2-invariants-moved'
import {
  ONE_PHONE_GESTURES,
  startV2Walk,
  v2Step,
  type V2Step,
  type WalkGestures,
} from '../../../scripts/dose-engine/v2-walk'

// Campagne d'invariants du moteur v2 (plan §6.3) : des carnets menés par les gestes de v2, les
// invariants vérifiés à chaque pas, horizon en jours, résidus connus dans le README. Séries longues :
// variables INVARIANTS_FROM, INVARIANTS_SEEDS, INVARIANTS_STEPS posées directement devant la commande
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
  /** Informatif tant que #1281, #1282, #1284 et #1285 restent ouverts : une graine par carnet. */
  lostMoves: string[]
  addedDoses: string[]
  byInvariant: Record<string, number>
  refusedCorrections: number
}

// Les graines rejouées gardent les gestes de leur découverte, sans la carte ni la réponse de « Changer la date ».
const REPLAYED: WalkGestures = { answers: true }

function playCampaign(
  { from, seeds, steps }: Campaign,
  gestures: WalkGestures = ONE_PHONE_GESTURES,
): Played {
  const played: Played = {
    carnets: 0,
    steps: 0,
    failures: [],
    lostMoves: [],
    addedDoses: [],
    byInvariant: {},
    refusedCorrections: 0,
  }
  for (let seed = from; seed < from + seeds; seed += 1) {
    const walk = startV2Walk(seed, gestures)
    const checks = mulberry32(seed ^ 0x4f1bbcdc)
    let failure: string | null = null
    let lostMove = false
    let addedDose = false
    const onStep = (step: V2Step) => {
      played.steps += 1
      if (failure !== null) return
      if (!lostMove && movedArrives(step) !== null) {
        lostMove = true
        played.lostMoves.push(`${seed}`)
      }
      if (!addedDose && noDoseAdded(step) !== null) {
        addedDose = true
        played.addedDoses.push(`${seed}`)
      }
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
    played.refusedCorrections += walk.log.filter((entry) =>
      entry.includes('Q38 corrigé refusé'),
    ).length
    if (failure !== null) played.failures.push(failure)
  }
  return played
}

const campaign = campaignOf(process.env)

describe('campagne d’invariants du moteur v2', () => {
  it(
    'les invariants tiennent à chaque geste',
    () => {
      const played = playCampaign(campaign)
      const last = campaign.from + campaign.seeds - 1
      console.warn(
        `Campagne : ${played.carnets} carnets × ${campaign.steps} gestes, graines ${campaign.from} à ${last}` +
          ` : ${played.steps} pas vérifiés, ${played.failures.length} carnets en échec` +
          `, « pas à donner » refusé ${played.refusedCorrections} fois` +
          `, dose déplacée absente (informatif) ${played.lostMoves.length}` +
          (played.lostMoves.length === 0 ? '' : ` : graines ${played.lostMoves.join(', ')}`) +
          `, doses à donner en plus (informatif) ${played.addedDoses.length}` +
          (played.addedDoses.length === 0 ? '' : ` : graines ${played.addedDoses.join(', ')}`) +
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

  // #872 : mensuel du 9 mars fini le 13, le 19 « sans heure », fin le 5 avril, « Prochaine dose » le 19
  // montrée par le formulaire : la correction garde sa grille (9 avril), « pas à donner » refusée.
  it('graine 9800001094 : la date montrée passée telle quelle n’est pas une date choisie pour juger le refus', () => {
    expect(playCampaign({ from: 9_800_001_094, seeds: 1, steps: 40 }, REPLAYED).failures).toEqual(
      [],
    )
  })

  // #928 : le report parti du jour où « tous les 2 jours » cède la place emporte sa dose sans heure.
  it('graine 8800001778 : une heure ajoutée ne change pas la journée d’arrivée du report', () => {
    expect(playCampaign({ from: 8_800_001_778, seeds: 1, steps: 40 }, REPLAYED).failures).toEqual(
      [],
    )
  })

  // #992 : redéplacé depuis la date choisie avant qu'une heure soit ajoutée, le report garde ses heures.
  it.each([120_000_798, 120_001_047])(
    'graine %i : une heure ajoutée ne change pas la dose d’un report redéplacé depuis la date choisie',
    (seed) => {
      expect(playCampaign({ from: seed, seeds: 1, steps: 40 }, REPLAYED).failures).toEqual([])
    },
  )

  // #1258 : 18 h du 8 avril reportée au 19 avec la case ; une posologie seule faisait apparaître 23 h le 19.
  it('graine 630000745 : une posologie seule ne change pas l’arrivée d’un report parti d’une arrivée', () => {
    expect(playCampaign({ from: 630_000_745, seeds: 1, steps: 30 }).failures).toEqual([])
  })

  // Trou connu #1258 : le report du 6 est écrit sous un réglage dont la grille, tournée par un décalage,
  // passe le 6 ; une heure ajoutée fait apparaître une dose sans heure le 7.
  it.fails(
    'graine 600000926 : une heure ajoutée ne change pas l’arrivée d’un report sans heure',
    () => {
      expect(playCampaign({ from: 600_000_926, seeds: 1, steps: 30 }).failures).toEqual([])
    },
  )

  // #1283 : 8 h du 13, première dose d'une date choisie, avancée au 11 sans la case, arrive le 11.
  it('graine 670000934 : la première dose d’une date choisie avancée sans la case arrive', () => {
    expect(playCampaign({ from: 670_000_934, seeds: 1, steps: 30 }).lostMoves).toEqual([])
  })

  // Trous connus de « dose déplacée présente » : les quatre doses du 13 reportées au 19, première dose
  // choisie du nouveau rythme (#1281) ; ramenées au 29 mars, sorti du calendrier (#1282).
  it.fails('graine 670000231 : un report arrivé sur la date choisie y emmène ses doses', () => {
    expect(playCampaign({ from: 670_000_231, seeds: 1, steps: 30 }).lostMoves).toEqual([])
  })

  it.fails('graine 9500001489 : une dose ramenée à son jour d’origine y revient', () => {
    expect(playCampaign({ from: 9_500_001_489, seeds: 1, steps: 30 }, {}).lostMoves).toEqual([])
  })

  it.fails(
    'graine 690000860 : le report arrivé dans un mensuel à date choisie y garde sa dose (#1284)',
    () => {
      expect(playCampaign({ from: 690_000_860, seeds: 1, steps: 30 }).lostMoves).toEqual([])
    },
  )

  it.each([
    ['INVARIANTS_SEEDS', 'mille'],
    ['INVARIANTS_FROM', '-3'],
    ['INVARIANTS_STEPS', '2.5'],
  ])('un réglage illisible arrête la campagne avant tout carnet : %s=%s', (name, value) => {
    expect(() => campaignOf({ [name]: value })).toThrow(/^Campagne illisible/)
  })
})
