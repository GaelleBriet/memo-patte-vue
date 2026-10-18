// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { forksOf, type Fork } from '../../../scripts/dose-engine/two-devices'
import { constatsOf, type Reader } from '../../../scripts/dose-engine/two-devices-constats'

// Campagne à deux téléphones (#867, #882, #883) : TW_FROM, TW_SEEDS, TW_STEPS, et TW_MAIN (moteur de
// `main`, pour ne compter que ses écarts) posées devant la commande (`scripts/dose-engine/README.md`).

type Campaign = { from: number; seeds: number; steps: number }

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Campagne illisible : ${name}=${raw}`)
  return value
}

function campaignOf(env: Record<string, string | undefined>): Campaign {
  return {
    from: positiveInteger('TW_FROM', env.TW_FROM, 8_710_000_000),
    seeds: positiveInteger('TW_SEEDS', env.TW_SEEDS, 10),
    steps: positiveInteger('TW_STEPS', env.TW_STEPS, 30),
  }
}

const campaign = campaignOf(process.env)

function forkAt(seed: number, step: number): Fork {
  let found: Fork | undefined
  forksOf(seed, step + 1, (fork) => {
    if (fork.step === step) found = fork
  })
  if (found === undefined) throw new Error(`pas de fourche : graine ${seed}, pas ${step}`)
  return found
}

describe('campagne à deux téléphones', () => {
  it(
    'ni report perdu ni dose de trop quand la réécriture n’a pas ôté la dose de départ',
    async () => {
      const path = process.env.TW_MAIN
      const main: Reader | undefined =
        path === undefined ? undefined : (await import(/* @vite-ignore */ path)).treatmentView
      let forks = 0
      const found: string[] = []
      for (let seed = campaign.from; seed < campaign.from + campaign.seeds; seed += 1) {
        forksOf(seed, campaign.steps, (fork) => {
          forks += 1
          found.push(...constatsOf(fork, main))
        })
      }
      const last = campaign.from + campaign.seeds - 1
      console.warn(
        `Campagne deux téléphones : ${campaign.seeds} carnets × ${campaign.steps} pas, graines ` +
          `${campaign.from} à ${last}${main ? ', comparée à main' : ''} : ${forks} fourches, ` +
          `${found.length} constats`,
      )
      expect(forks).toBeGreaterThan(0)
      expect(found.slice(0, 5)).toEqual([])
    },
    60_000 + campaign.seeds * campaign.steps * 60,
  )

  // Relecture de la PR #934 : B plus récent, la journée de départ porte une prise d'un réglage plus
  // ancien et garde ses heures sur B ; relue avec le report, elle perdait son heure.
  it.each([
    [9050000149, 19],
    [9050000702, 2],
    [9050000982, 14],
    [9050001002, 7],
    [9050001492, 15],
    [9050001582, 24],
    [9050001680, 6],
    [9050002117, 14],
    [8710000904, 25],
    [8710001002, 27],
    [9530000151, 3],
    [9530000428, 15],
    [9530000449, 26],
    [9530000552, 1],
    [9530000583, 21],
    [9530000583, 24],
    [9530000719, 19],
    [9530001267, 16],
    [9530001286, 18],
    [9530001637, 18],
  ])('graine %i, pas %i : le report de A n’est pas perdu', (seed, step) => {
    expect(constatsOf(forkAt(seed, step))).toEqual([])
  })

  it.each([
    ['TW_SEEDS', 'mille'],
    ['TW_FROM', '-3'],
    ['TW_STEPS', '2.5'],
  ])('un réglage illisible arrête la campagne avant tout carnet : %s=%s', (name, value) => {
    expect(() => campaignOf({ [name]: value })).toThrow(/^Campagne illisible/)
  })
})
