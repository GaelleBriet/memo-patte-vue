// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { remindersBrokenBy } from '../../../scripts/dose-engine/v2-reminders'
import { startV2Walk, v2Step } from '../../../scripts/dose-engine/v2-walk'
import { treatmentView, type ReminderWindow } from '../domain/dose-calendar'
import { keys, line, proposedSetting, setting } from './dose-calendar.v2.aides'

const WINDOW: ReminderWindow = { count: 60, daysBefore: 3, daysAfter: 3 }

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
const timeout = 60_000 + campaign.seeds * campaign.steps * 60

function playV2(): { carnets: number; steps: number; failures: string[] } {
  const played = { carnets: 0, steps: 0, failures: [] as string[] }
  for (let seed = campaign.from; seed <= last; seed += 1) {
    const walk = startV2Walk(seed)
    let failure: string | null = null
    for (let count = 0; count < campaign.steps && failure === null; count += 1) {
      v2Step(walk, (each) => {
        played.steps += 1
        const broken = failure === null ? remindersBrokenBy(each.after) : null
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
    'campagne : les rappels programmés sont les échéances de la fiche, selon RA-1 à RA-6 et RA-19',
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

  it('#929 : la dernière journée lue, coupée par le nombre de rappels, peut garder 8 h plutôt que sa dose sans heure', () => {
    const every3 = { value: 3, unit: 'day' } as const
    const p1 = setting('p1', '2026-10-07', every3, ['08:00', '20:00'], { startsOn: '2026-10-01' })
    const p2 = proposedSetting('p2', '2026-10-07', every3, [], { startsOn: '2026-10-05' })
    const input = {
      settings: [p1, p2],
      lines: [line('p1', 'postponed', '2027-04-11', '08:00', '2027-04-14')],
      today: '2026-10-05',
    }
    const view = treatmentView(input)
    const lastDay = view
      .reminders(WINDOW)
      .filter(({ due }) => due.dueOn === '2027-04-14')
      .map(({ due }) => keys([due])[0])

    expect(keys(view.slots('2027-04-14', '2027-04-14').map(({ due }) => due))).toEqual([
      '2027-04-14',
      '2027-04-14 08:00',
      '2027-04-14 20:00',
    ])
    expect(lastDay).toEqual(['2027-04-14 08:00'])
    expect(remindersBrokenBy(input)).toBeNull()
  })

  it.each([
    ['RAPPELS_SEEDS', 'mille'],
    ['RAPPELS_FROM', '-3'],
    ['RAPPELS_STEPS', '2.5'],
  ])('un réglage illisible arrête la campagne avant tout carnet : %s=%s', (name, value) => {
    expect(() => campaignOf({ [name]: value })).toThrow(/^Campagne illisible/)
  })
})
