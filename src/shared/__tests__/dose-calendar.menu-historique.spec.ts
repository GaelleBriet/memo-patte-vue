// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { historyMenuReport } from '../../../scripts/dose-engine/history-menu'

// Campagne « le menu ⋮ de l'historique ne propose que ce que le moteur accepte » (#947) : MENU_FROM,
// MENU_SEEDS, MENU_STEPS posées directement devant la commande (`scripts/dose-engine/README.md`).

type Campaign = { from: number; seeds: number; steps: number }

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Campagne illisible : ${name}=${raw}`)
  return value
}

function campaignOf(env: Record<string, string | undefined>): Campaign {
  return {
    from: positiveInteger('MENU_FROM', env.MENU_FROM, 9_600_000_000),
    seeds: positiveInteger('MENU_SEEDS', env.MENU_SEEDS, 10),
    steps: positiveInteger('MENU_STEPS', env.MENU_STEPS, 40),
  }
}

const campaign = campaignOf(process.env)

describe('#947 : le menu ⋮ de l’historique ne propose que des gestes que le moteur accepte', () => {
  it(
    'aucun geste proposé refusé par le moteur, aucun « Supprimer » grisé qu’il accepte',
    () => {
      let offered = 0
      const refused: string[] = []
      for (let seed = campaign.from; seed < campaign.from + campaign.seeds; seed += 1) {
        const report = historyMenuReport(seed, campaign.steps)
        offered += report.offered
        refused.push(...report.refused)
      }
      const last = campaign.from + campaign.seeds - 1
      console.warn(
        `Campagne menu de l’historique : ${campaign.seeds} carnets × ${campaign.steps} gestes, ` +
          `graines ${campaign.from} à ${last} : ${offered} gestes proposés, ${refused.length} refusés` +
          refused.map((text) => `\n  ${text}`).join(''),
      )
      expect(refused.slice(0, 5)).toEqual([])
    },
    60_000 + campaign.seeds * campaign.steps * 60,
  )

  it.each([
    [977_001_278, 24],
    [977_003_652, 30],
    [9_600_000_073, 40],
  ])(
    'graine %i : le geste refusé par « une prise resterait sans échéance » n’est plus proposé',
    (seed, steps) => {
      expect(historyMenuReport(seed, steps).refused).toEqual([])
    },
  )

  it.each([9_600_000_154, 9_600_000_163, 9_600_000_418, 9_600_001_479])(
    'graine %i (#961) : « Supprimer » que le moteur refuse est grisé, jamais proposé actif',
    (seed) => {
      expect(historyMenuReport(seed, 40).refused).toEqual([])
    },
  )

  it.each([
    ['MENU_SEEDS', 'mille'],
    ['MENU_FROM', '-3'],
    ['MENU_STEPS', '2.5'],
  ])('un réglage illisible arrête la campagne avant tout carnet : %s=%s', (name, value) => {
    expect(() => campaignOf({ [name]: value })).toThrow(/^Campagne illisible/)
  })
})
