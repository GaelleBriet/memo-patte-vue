// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { OPENING_TIMES, planBrokenBy } from '../../../scripts/dose-engine/v2-reminder-plan'
import { remindersBrokenBy } from '../../../scripts/dose-engine/v2-reminders'
import { startV2Walk, v2Step } from '../../../scripts/dose-engine/v2-walk'
import type { TreatmentViewInput } from '../domain/dose-calendar'
import { keys, line, proposedSetting, setting, view } from './dose-calendar.v2.aides'
import seed9200000052 from './fixtures/rappels-graine-9200000052.json'

// Rappels = fiche (pas 8 de l'épic #758). Séries longues : RAPPELS_FROM, RAPPELS_SEEDS,
// RAPPELS_STEPS posées directement devant la commande (`.claude/rules/outils-de-test.md`).

type Campaign = { from: number; seeds: number; steps: number }

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Campagne illisible : ${name}=${raw}`)
  return value
}

function campaignOf(env: Record<string, string | undefined>): Campaign {
  return {
    from: positiveInteger('RAPPELS_FROM', env.RAPPELS_FROM, 640_000_000),
    seeds: positiveInteger('RAPPELS_SEEDS', env.RAPPELS_SEEDS, 25),
    steps: positiveInteger('RAPPELS_STEPS', env.RAPPELS_STEPS, 24),
  }
}

const campaign = campaignOf(process.env)
const last = campaign.from + campaign.seeds - 1
const timeout = 60_000 + campaign.seeds * campaign.steps * 120

function brokenBy(input: TreatmentViewInput) {
  const inView = remindersBrokenBy(input)
  if (inView !== null) return inView
  for (const time of OPENING_TIMES) {
    const inPlan = planBrokenBy(input, time)
    if (inPlan !== null) return inPlan
  }
  return null
}

function playV2(): { carnets: number; steps: number; failures: string[] } {
  const played = { carnets: 0, steps: 0, failures: [] as string[] }
  for (let seed = campaign.from; seed <= last; seed += 1) {
    const walk = startV2Walk(seed)
    let failure: string | null = null
    for (let count = 0; count < campaign.steps && failure === null; count += 1) {
      v2Step(walk, (each) => {
        played.steps += 1
        const broken = failure === null ? brokenBy(each.after) : null
        if (broken === null) return
        failure =
          `graine ${seed}, ${each.label} : ${broken.invariant}\n${broken.detail}\n` +
          `carnet : ${JSON.stringify(each.after)}`
      })
    }
    played.carnets += 1
    if (failure !== null) played.failures.push(failure)
  }
  return played
}

describe('rappels lus dans la vue (pas 8)', () => {
  it(
    'campagne : les rappels programmés sont les échéances de la fiche, selon RA-1 à RA-6, RA-11, RA-12 et RA-19',
    () => {
      const played = playV2()
      console.warn(
        `Campagne rappels : ${played.carnets} carnets × ${campaign.steps} gestes, graines ` +
          `${campaign.from} à ${last} : ${played.steps} pas vérifiés, ${played.failures.length} carnets en échec`,
      )
      expect(played.carnets).toBe(campaign.seeds)
      expect(played.steps).toBeGreaterThan(campaign.seeds)
      expect(played.failures.slice(0, 3)).toEqual([])
    },
    timeout,
  )

  describe('#929, #933 : tous les 3 jours à 8 h et 20 h, puis « Modifier » le 5 octobre 2026, sans heure dès le 7', () => {
    const every3 = { value: 3, unit: 'day' } as const
    const p1 = setting('p1', '2026-10-07', every3, ['08:00', '20:00'], { startsOn: '2026-10-01' })
    const p2 = proposedSetting('p2', '2026-10-07', every3, [], { startsOn: '2026-10-05' })

    it('la dose de 8 h du 11 avril 2027 reportée au 14 : le 14 avril, dernière journée lue, garde ses trois échéances', () => {
      const lines = [line('p1', 'postponed', '2027-04-11', '08:00', '2027-04-14')]
      const input = { settings: [p1, p2], lines, today: '2026-10-05' }
      const day = view(input.settings, lines, input.today).slots('2027-04-14', '2027-04-14')

      expect(keys(day.map(({ due }) => due))).toEqual([
        '2027-04-14',
        '2027-04-14 08:00',
        '2027-04-14 20:00',
      ])
      expect(brokenBy(input)).toBeNull()
    })

    it('la dose de 8 h du 10 octobre reportée au 13, l’app ouverte le 13 à 23 h 59 : le plan garde son relais', () => {
      const lines = [line('p1', 'postponed', '2026-10-10', '08:00', '2026-10-13')]

      expect(planBrokenBy({ settings: [p1, p2], lines, today: '2026-10-13' }, '23:59')).toBeNull()
    })
  })

  it('#933, graine 9200000052 : tous les jours à 8 h, 14 h et 20 h, « Modifier » le 12 avril sans heure, la dose de 14 h du 13 reportée au 15, l’app ouverte le 15 à 23 h 59 : le plan garde son relais', () => {
    expect(planBrokenBy(seed9200000052 as TreatmentViewInput, '23:59')).toBeNull()
  })

  it.each([
    ['RAPPELS_SEEDS', 'mille'],
    ['RAPPELS_FROM', '-3'],
    ['RAPPELS_STEPS', '2.5'],
  ])('un réglage illisible arrête la campagne avant tout carnet : %s=%s', (name, value) => {
    expect(() => campaignOf({ [name]: value })).toThrow(/^Campagne illisible/)
  })
})
