import { previousDay } from './calendar-day'
import type { Setting } from './dose-calendar'

type Ordered = Pick<Setting, 'id' | 'startsOn' | 'createdAt'>

/** Les périodes d'un traitement, la plus récente d'abord. */
export function byStartDescending(a: Ordered, b: Ordered): number {
  const [left, right] = [a, b].map(
    ({ startsOn, createdAt, id }) => `${startsOn} ${createdAt} ${id}`,
  )
  return left! < right! ? 1 : left! > right! ? -1 : 0
}

/** Dernier jour d'une période : sa fin, son arrêt ou la veille de la suivante ; `null` si ouverte. */
export function periodLastDay(
  period: Pick<Setting, 'endsOn' | 'stoppedOn'>,
  next: Pick<Setting, 'startsOn'> | undefined,
): string | null {
  const beforeNext = next === undefined ? null : previousDay(next.startsOn)
  return (
    [period.endsOn, period.stoppedOn, beforeNext].filter((day) => day !== null).sort()[0] ?? null
  )
}

/** Arrêtée, finie ou remplacée par `next` avant sa première échéance. */
export function periodClosedBeforeFirstDue(
  period: Pick<Setting, 'firstDueOn' | 'endsOn' | 'stoppedOn'>,
  next: Pick<Setting, 'startsOn'> | undefined,
): boolean {
  const last = periodLastDay(period, next)
  return last !== null && last < period.firstDueOn
}

export function hasSeveralDoseTimes(times: readonly string[]): boolean {
  return times.length > 1
}

export function isSeveralTimesADay(period: Pick<Setting, 'times'>): boolean {
  return hasSeveralDoseTimes(period.times)
}
