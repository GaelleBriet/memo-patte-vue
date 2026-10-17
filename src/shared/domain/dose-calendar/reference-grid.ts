import type { ReferenceFrequency, ReferenceLine, ReferenceSetting } from './reference-types'

export type Hour = string | null

const DAY_MS = 86_400_000

const toTime = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
const toDay = (time: number) => new Date(time).toISOString().slice(0, 10)
export const plusDays = (day: string, count: number) => toDay(toTime(day) + count * DAY_MS)
export const later = (a: string, b: string) => (a > b ? a : b)
export const keyOf = (day: string, hour: Hour) => (hour === null ? day : `${day} ${hour}`)
export const hoursOf = (setting: ReferenceSetting): Hour[] =>
  setting.times.length === 0 ? [null] : [...setting.times].sort()
export const sameHours = (a: ReferenceSetting, b: ReferenceSetting) =>
  hoursOf(a).join() === hoursOf(b).join()

export function stepped(origin: string, { value, unit }: ReferenceFrequency, step: number): string {
  if (unit !== 'month') return plusDays(origin, step * value * (unit === 'week' ? 7 : 1))
  const months = +origin.slice(5, 7) - 1 + step * value
  const year = +origin.slice(0, 4) + Math.floor(months / 12)
  const month = ((months % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return toDay(Date.UTC(year, month, Math.min(+origin.slice(8, 10), lastDay)))
}

export const longestStep = ({ value, unit }: ReferenceFrequency) =>
  value * (unit === 'month' ? 31 : unit === 'week' ? 7 : 1)

// R2 : l'origine plus un nombre entier de pas, de `from` à `to` inclus.
export function gridDays(origin: string, frequency: ReferenceFrequency, from: string, to: string) {
  const longest = longestStep(frequency)
  const days: string[] = []
  let step = Math.floor((toTime(from) - toTime(origin)) / DAY_MS / longest) - 1
  for (
    let day = stepped(origin, frequency, step);
    day <= to;
    day = stepped(origin, frequency, ++step)
  ) {
    if (day >= from) days.push(day)
  }
  return days
}

export const sameFrequency = (a: ReferenceSetting, b: ReferenceSetting) =>
  a.frequency.value === b.frequency.value && a.frequency.unit === b.frequency.unit

export const isOnGrid = (origin: string, frequency: ReferenceFrequency, day: string) =>
  gridDays(origin, frequency, day, day).length === 1

/** La grille en vigueur ; `floor` : veille du premier jour lu ; `since` : veille de la première échéance. */
export type Grid = { origin: string; floor: string; since: string }

export const isDueDay = (on: Grid, setting: ReferenceSetting, day: string) =>
  day > on.since && isOnGrid(on.origin, setting.frequency, day)

/** R6 : à partir de sa journée d'origine, un décalage donne à la grille l'origine de son ancrage. */
export const turned = (turn: ReferenceLine, floor: string): Grid => ({
  origin: turn.targetOn!,
  floor: later(floor, later(turn.dueOn, turn.targetOn!)),
  since: later(turn.dueOn, turn.targetOn!),
})

/** R3, R9 : la grille en vigueur à la première échéance d'un réglage, et les décalages du rythme qui la portent. */
export function inForceAt(
  grid: Grid,
  setting: ReferenceSetting,
  shifts: readonly ReferenceLine[],
  rhythm: ReadonlySet<string>,
): { inForce: Grid; held: Set<ReferenceLine> } {
  const held = new Set<ReferenceLine>()
  const inForce = shifts
    .filter(
      ({ dueOn, settingId }) =>
        dueOn >= setting.startsOn && dueOn < setting.firstDueOn && rhythm.has(settingId),
    )
    .reduce((on, shift) => {
      if (!isDueDay(on, setting, shift.dueOn)) return on
      held.add(shift)
      return turned(shift, '')
    }, grid)
  return { inForce, held }
}
