import type { Day, Frequency, GridRun, Hour, Setting } from './types'

const DAY_MS = 86_400_000

const timeOf = (day: Day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
const dayOf = (time: number): Day => new Date(time).toISOString().slice(0, 10)

export const plusDays = (day: Day, count: number): Day => dayOf(timeOf(day) + count * DAY_MS)
export const later = (a: Day, b: Day): Day => (a > b ? a : b)
export const keyOf = (day: Day, hour: Hour): string => (hour === null ? day : `${day} ${hour}`)
export const dayOfKey = (key: string): Day => key.slice(0, 10)

/** R2 : l'origine plus `step` pas ; en mois, un jour qui n'existe pas devient le dernier du mois. */
export function stepped(origin: Day, { value, unit }: Frequency, step: number): Day {
  if (unit !== 'month') return plusDays(origin, step * value * (unit === 'week' ? 7 : 1))
  const months = +origin.slice(5, 7) - 1 + step * value
  const year = +origin.slice(0, 4) + Math.floor(months / 12)
  const month = ((months % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return dayOf(Date.UTC(year, month, Math.min(+origin.slice(8, 10), lastDay)))
}

/** Le plus long pas possible, en jours. */
export const longestStep = ({ value, unit }: Frequency): number =>
  value * (unit === 'month' ? 31 : unit === 'week' ? 7 : 1)

/** R2 : les journées de la grille de `from` à `to` inclus. */
export function gridDays(origin: Day, frequency: Frequency, from: Day, to: Day): Day[] {
  const days: Day[] = []
  let step = Math.floor((timeOf(from) - timeOf(origin)) / DAY_MS / longestStep(frequency)) - 1
  for (
    let day = stepped(origin, frequency, step);
    day <= to;
    day = stepped(origin, frequency, ++step)
  ) {
    if (day >= from) days.push(day)
  }
  return days
}

/** Les journées de suites régulières, de `from` à `to` inclus. */
export function runDays(runs: readonly GridRun[], frequency: Frequency, from: Day, to: Day): Day[] {
  return runs.flatMap(([start, end]) => {
    const last = end === null || end > to ? to : end
    return gridDays(start, frequency, later(from, start), last)
  })
}

export const isOnGrid = (origin: Day, frequency: Frequency, day: Day): boolean =>
  gridDays(origin, frequency, day, day).length === 1

export const sameFrequency = (a: Frequency, b: Frequency): boolean =>
  a.value === b.value && a.unit === b.unit

/** R3, R9 : à fréquence gardée, un réglage sans origine, ou dont l'origine tombe sur la grille en vigueur, la continue. */
export const continuesGrid = (
  origin: Day,
  previous: Pick<Setting, 'frequency'> | undefined,
  setting: Pick<Setting, 'frequency' | 'gridOriginOn'>,
): boolean =>
  previous !== undefined &&
  sameFrequency(previous.frequency, setting.frequency) &&
  (setting.gridOriginOn === null || isOnGrid(origin, setting.frequency, setting.gridOriginOn))

/** La dernière écriture de la grille d'un réglage (v17), sinon celle de ses réglages, sinon sa création. */
export const gridDateOf = (
  setting: Pick<Setting, 'gridWrittenAt' | 'updatedAt' | 'createdAt'>,
): string => setting.gridWrittenAt ?? setting.updatedAt ?? setting.createdAt

/** Les heures d'une journée, triées ; une seule échéance sans heure. */
export const hoursOf = (times: readonly string[]): Hour[] =>
  times.length === 0 ? [null] : [...times].sort()

export const sameHours = (a: Pick<Setting, 'times'>, b: Pick<Setting, 'times'>): boolean =>
  hoursOf(a.times).join() === hoursOf(b.times).join()
