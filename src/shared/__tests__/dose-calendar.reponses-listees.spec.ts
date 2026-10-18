// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { listedReport } from '../../../scripts/dose-engine/listed-answers'

// Campagne « seules les doses listées sortent » (#873) : LISTED_FROM, LISTED_SEEDS, LISTED_STEPS posées
// directement devant la commande (`scripts/dose-engine/README.md`).

type Campaign = { from: number; seeds: number; steps: number }

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Campagne illisible : ${name}=${raw}`)
  return value
}

function campaignOf(env: Record<string, string | undefined>): Campaign {
  return {
    from: positiveInteger('LISTED_FROM', env.LISTED_FROM, 9_760_000_000),
    seeds: positiveInteger('LISTED_SEEDS', env.LISTED_SEEDS, 20),
    steps: positiveInteger('LISTED_STEPS', env.LISTED_STEPS, 40),
  }
}

const campaign = campaignOf(process.env)

describe('#873 : « Elles n’étaient pas à donner » ne retire que les doses listées', () => {
  it(
    'aucune dose retirée qui n’a pas été listée par la question',
    () => {
      let answers = 0
      let removed = 0
      const unlisted: string[] = []
      const reshown: string[] = []
      for (let seed = campaign.from; seed < campaign.from + campaign.seeds; seed += 1) {
        const report = listedReport(seed, campaign.steps)
        answers += report.answers
        removed += report.removed
        unlisted.push(...report.unlisted)
        reshown.push(...report.reshown)
      }
      const last = campaign.from + campaign.seeds - 1
      console.warn(
        `Campagne doses listées : ${campaign.seeds} carnets × ${campaign.steps} gestes, graines ` +
          `${campaign.from} à ${last} : ${answers} réponses « pas à donner », ${removed} doses ` +
          `retirées, ${unlisted.length} états avec une dose retirée sans être listée, ${reshown.length} ` +
          `états avec une dose listée encore à donner`,
      )
      expect(unlisted.slice(0, 5)).toEqual([])
      expect(reshown.slice(0, 5)).toEqual([])
    },
    60_000 + campaign.seeds * campaign.steps * 40,
  )

  // Relecture de la PR #948 : la prise d'une dose non listée, supprimée après la réponse.
  it.each([9_760_000_253, 9_761_001_562, 9_761_002_009, 9_761_008_508])(
    'graine %i : une dose découverte après la réponse, jamais listée, revient',
    (seed) => {
      expect(listedReport(seed, 40).unlisted).toEqual([])
    },
  )

  it.each([
    ['LISTED_SEEDS', 'mille'],
    ['LISTED_FROM', '-3'],
    ['LISTED_STEPS', '2.5'],
  ])('un réglage illisible arrête la campagne avant tout carnet : %s=%s', (name, value) => {
    expect(() => campaignOf({ [name]: value })).toThrow(/^Campagne illisible/)
  })
})
