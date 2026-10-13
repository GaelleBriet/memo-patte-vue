// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { viewInputOf } from '../domain/dose-calendar'
import { plusDays, type Book } from '../../../scripts/dose-engine/carnet'
import { gapsBetween } from '../../../scripts/dose-engine/display'
import { currentEngine, readWith, v2Engine } from '../../../scripts/dose-engine/engines'
import {
  legacyReminders,
  viewReminders,
  type ReminderReading,
} from '../../../scripts/dose-engine/legacy-reminders'
import { remindersBrokenBy } from '../../../scripts/dose-engine/v2-reminders'
import { startV2Walk, v2Step } from '../../../scripts/dose-engine/v2-walk'
import { step } from '../../../scripts/dose-engine/walk'
import { keptBook, startWalk, WalkStopped } from '../../../scripts/dose-engine/walk-state'

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

type Tally = {
  carnets: number
  states: number
  sameView: number
  sameReminders: number
  notedByView: number
  otherView: number
  otherReminders: number
  unexplained: string[]
}

const text = (reading: ReminderReading) =>
  JSON.stringify('error' in reading ? reading : [...reading.reminders].sort())

/** RA-19 : une échéance encore au calendrier est notée d'après la fiche, plus d'après une ligne sans effet. */
function notedApart(old: ReminderReading, now: ReminderReading): string[] | null {
  if ('error' in old || 'error' in now) return null
  const apart = [
    ...old.noted.filter((key) => !now.noted.includes(key)),
    ...now.noted.filter((key) => !old.noted.includes(key)),
  ]
  return apart.every((key) => now.inCalendar!.includes(key)) ? apart : null
}

function difference(a: ReminderReading, b: ReminderReading): string {
  if ('error' in a || 'error' in b) return `${text(a)}\n≠ ${text(b)}`
  const only = (left: string[], right: string[]) => left.filter((line) => !right.includes(line))
  return JSON.stringify({
    ancien: [
      ...only(a.reminders, b.reminders),
      ...only(a.noted, b.noted).map((key) => `notée ${key}`),
    ],
    vue: [
      ...only(b.reminders, a.reminders),
      ...only(b.noted, a.noted).map((key) => `notée ${key}`),
    ],
  })
}

function horizonOf(book: Book, readings: ReminderReading[]): string {
  const days = readings.flatMap((reading) =>
    'error' in reading ? [] : reading.reminders.map((line) => line.slice(-10)),
  )
  return [plusDays(book.today, 120), ...days].sort().at(-1)!
}

function compareState(book: Book, tally: Tally, seed: number): void {
  tally.states += 1
  const readable = readWith(v2Engine, book)
  const broken = 'error' in readable ? null : remindersBrokenBy(viewInputOf(book))
  if (broken !== null && tally.unexplained.length < 3) {
    tally.unexplained.push(`graine ${seed} : ${broken.invariant} ${broken.detail}`)
  }
  const old = legacyReminders(book)
  const now = viewReminders(book)
  const until = horizonOf(book, [old, now])
  const sameView =
    gapsBetween(readWith(currentEngine, book, until), readWith(v2Engine, book, until)).length === 0
  const apart = notedApart(old, now)
  const same = text(old) === text(now)
  if (!sameView) {
    tally.otherView += 1
    if (!same || apart?.length !== 0) tally.otherReminders += 1
    return
  }
  tally.sameView += 1
  if (same && apart !== null) {
    tally.sameReminders += 1
    if (apart.length > 0) tally.notedByView += 1
  } else if (tally.unexplained.length < 3) {
    tally.unexplained.push(
      `graine ${seed} : ${difference(old, now)}\ncarnet : ${JSON.stringify(book)}`,
    )
  }
}

function playOracle(): Tally {
  const tally: Tally = {
    carnets: 0,
    states: 0,
    sameView: 0,
    sameReminders: 0,
    notedByView: 0,
    otherView: 0,
    otherReminders: 0,
    unexplained: [],
  }
  for (let seed = campaign.from; seed <= last; seed += 1) {
    const walk = startWalk(seed, 'avec')
    compareState(keptBook(walk), tally, seed)
    try {
      for (let count = 0; count < campaign.steps; count += 1) {
        step(walk, () => compareState(keptBook(walk), tally, seed))
      }
    } catch (error) {
      if (!(error instanceof WalkStopped)) throw error
    }
    tally.carnets += 1
  }
  return tally
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

  it(
    'oracle : là où l’ancien moteur et la vue montrent la même fiche, les rappels sont les mêmes ; ailleurs, ceux de la fiche',
    () => {
      const tally = playOracle()
      console.warn(
        `Oracle rappels : ${tally.carnets} carnets × ${campaign.steps} gestes, graines ` +
          `${campaign.from} à ${last} : ${tally.states} états ; fiche identique ${tally.sameView}` +
          ` (rappels identiques ${tally.sameReminders}, dont ${tally.notedByView} où la vue lit` +
          ` autrement une échéance notée) ; fiche différente ${tally.otherView}` +
          ` (rappels différents ${tally.otherReminders})`,
      )
      expect(tally.carnets).toBe(campaign.seeds)
      expect(tally.states).toBeGreaterThan(campaign.seeds)
      expect(tally.unexplained).toEqual([])
    },
    timeout,
  )

  it.each([
    ['RAPPELS_SEEDS', 'mille'],
    ['RAPPELS_FROM', '-3'],
    ['RAPPELS_STEPS', '2.5'],
  ])('un réglage illisible arrête la campagne avant tout carnet : %s=%s', (name, value) => {
    expect(() => campaignOf({ [name]: value })).toThrow(/^Campagne illisible/)
  })
})
