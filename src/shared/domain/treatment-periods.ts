import { previousDay } from './calendar-day'
import type { Line, Setting } from './dose-calendar'

type Ordered = Pick<Setting, 'id' | 'startsOn' | 'createdAt'>

/** Les périodes d'un traitement, la plus récente d'abord. */
export function byStartDescending(a: Ordered, b: Ordered): number {
  const [left, right] = [a, b].map(
    ({ startsOn, createdAt, id }) => `${startsOn} ${createdAt} ${id}`,
  )
  return left! < right! ? 1 : left! > right! ? -1 : 0
}

/** Dernier jour d'une période : sa fin, son arrêt ou la veille de la suivante ; `null` si ouverte. */
function periodLastDay(
  period: Pick<Setting, 'endsOn' | 'stoppedOn'>,
  next: Pick<Setting, 'startsOn'> | undefined,
): string | null {
  const beforeNext = next === undefined ? null : previousDay(next.startsOn)
  return (
    [period.endsOn, period.stoppedOn, beforeNext].filter((day) => day !== null).sort()[0] ?? null
  )
}

type Shown = Ordered & Pick<Setting, 'firstDueOn' | 'endsOn' | 'stoppedOn'>

const closedBefore = (older: Shown, period: Shown): boolean =>
  older.stoppedOn !== null || (older.endsOn !== null && older.endsOn < period.startsOn)

// Le début du modèle reste le jour du geste : seul l'affichage date une reprise de sa première échéance.
function shownStartOf(period: Shown, older: Shown | undefined): string {
  return older !== undefined && closedBefore(older, period) ? period.firstDueOn : period.startsOn
}

/**
 * R12 : le début d'une période et sa fin enregistrée ; une période qui suit une période arrêtée ou
 * finie commence à sa première échéance. `lastDay` : `null` si ouverte.
 */
export function periodShownDays(
  periods: readonly Shown[],
  period: Shown,
): { start: string; lastDay: string | null } {
  const sorted = [...periods].sort(byStartDescending)
  const index = sorted.findIndex(({ id }) => id === period.id)
  const next = index > 0 ? sorted[index - 1] : undefined
  const nextStart = next === undefined ? undefined : { startsOn: shownStartOf(next, period) }
  return {
    start: shownStartOf(period, index < 0 ? undefined : sorted[index + 1]),
    lastDay: periodLastDay(period, nextStart),
  }
}

type DoseDay = Pick<Line, 'status' | 'dueOn'>

/**
 * R12 : les jours de l'étiquette d'une période, sur la fiche comme sur le PDF ; la veille de la période
 * suivante s'allonge jusqu'à l'échéance de sa dernière ligne, hors décalage et « pas à donner », jamais
 * au-delà de son arrêt ni de sa date de fin. `lines` : ses lignes de l'historique.
 */
export function periodShownRange(
  periods: readonly Shown[],
  period: Shown,
  lines: readonly DoseDay[],
): { start: string; lastDay: string | null } {
  const { start, lastDay } = periodShownDays(periods, period)
  const lastDose = lines
    .filter(({ status }) => status !== 'shift' && status !== 'not-due')
    .reduce<string | null>(
      (last, { dueOn }) => (last === null || dueOn > last ? dueOn : last),
      null,
    )
  if (lastDay === null || lastDose === null || lastDose <= lastDay) return { start, lastDay }
  const closedOn = [period.endsOn, period.stoppedOn].filter((day) => day !== null).sort()[0]
  return { start, lastDay: closedOn !== undefined && closedOn < lastDose ? closedOn : lastDose }
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
