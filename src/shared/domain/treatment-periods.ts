import { format, parseISO, subDays } from 'date-fns'

import type { TreatmentPeriodInput } from './treatment-schedule'

type Ordered = Pick<TreatmentPeriodInput, 'id' | 'startsOn' | 'createdAt'>

/** Les périodes d'un traitement, la plus récente d'abord. */
export function byStartDescending(a: Ordered, b: Ordered): number {
  const [left, right] = [a, b].map(
    ({ startsOn, createdAt, id }) => `${startsOn} ${createdAt} ${id}`,
  )
  return left! < right! ? 1 : left! > right! ? -1 : 0
}

/** Dernier jour d'une période : sa fin, son arrêt ou la veille de la suivante ; `null` si ouverte. */
export function periodLastDay(
  period: Pick<TreatmentPeriodInput, 'endsOn' | 'stoppedOn'>,
  next: Pick<TreatmentPeriodInput, 'startsOn'> | undefined,
): string | null {
  const beforeNext =
    next === undefined ? null : format(subDays(parseISO(next.startsOn), 1), 'yyyy-MM-dd')
  return (
    [period.endsOn, period.stoppedOn, beforeNext].filter((day) => day !== null).sort()[0] ?? null
  )
}
