import { sameFrequency, sameHours } from './grid'
import type { Span } from './settings'
import type { Hour, Setting } from './types'

/** Les heures d'une journée et celles qu'une prise couvre. */
export type DayReading = { hours: readonly Hour[]; covered: ReadonlySet<Hour> }

/** R7 : ce qu'un report retire de sa journée d'origine, et les doses qu'il apporte à son arrivée. */
export type ReportMove = { beaten: boolean; leaving: Hour[]; brought: Hour[] }

/**
 * R7 : un report emporte son heure et les suivantes encore sans prise. Après un changement d'heures
 * seules, il déplace des doses, pas des heures (décision de Gaelle du 15 octobre 2026) : comptées aux
 * heures d'avant (`before`), sa journée les perd à partir du même rang, s'il existe encore.
 */
export function reportMove(now: DayReading, dueTime: Hour, before: DayReading | null): ReportMove {
  const isAfter = (hour: Hour) => (hour ?? '') >= (dueTime ?? '')
  const following = ({ hours, covered }: DayReading) =>
    hours.filter((hour) => !covered.has(hour) && isAfter(hour))
  if (before === null) {
    const leaving = following(now)
    return { beaten: now.covered.has(dueTime), leaving, brought: leaving }
  }
  const rank = before.hours.findIndex(isAfter)
  return {
    beaten: before.covered.has(dueTime),
    leaving: rank < 0 ? [] : now.hours.slice(rank).filter((hour) => !now.covered.has(hour)),
    brought: following(before),
  }
}

/**
 * Le réglage dont un report garde les heures après un changement d'heures seules : le premier du
 * rythme qui lit sa journée d'origine, pas plus tôt que le sien ; aucun si les heures n'ont pas changé.
 */
export function hoursChangedFrom(span: Span, own: Setting, from: Setting): Setting | undefined {
  const { live, episode } = span
  let first = live.indexOf(from)
  while (
    first > 0 &&
    sameFrequency(live[first - 1]!.frequency, from.frequency) &&
    episode.indexOf(live[first - 1]!) >= episode.indexOf(own)
  ) {
    first -= 1
  }
  const reference = live[first]
  return reference === undefined || sameHours(reference, from) ? undefined : reference
}

/** R7 : une journée d'arrivée n'a que ses dernières heures ; lue avant le changement, de même. */
export function hoursAsBefore(
  now: readonly Hour[],
  full: readonly Hour[],
  before: readonly Hour[],
): Hour[] {
  if (now.length === 0) return []
  return now.length === full.length ? [...before] : before.slice(-now.length)
}
