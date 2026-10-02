import { addDays, addMonths, addWeeks, formatISO } from 'date-fns'

import type { Due, Frequency } from './treatment-schedule-types'

export const DAYS_PER_STEP = { day: 1, week: 7, month: 28 }

// Bien plus rapide que `parseISO` et `format` : un calcul décale des milliers de dates.
export function toDate(day: string): Date {
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
}

function toDay(date: Date): string {
  return formatISO(date, { representation: 'date' })
}

export function shiftDate(date: string, { value, unit }: Frequency, steps: number): string {
  if (steps === 0) return date
  const start = toDate(date)
  const amount = value * steps
  const shifted =
    unit === 'day'
      ? addDays(start, amount)
      : unit === 'week'
        ? addWeeks(start, amount)
        : addMonths(start, amount)
  return toDay(shifted)
}

export function nextDay(date: string): string {
  return toDay(addDays(toDate(date), 1))
}

export function previousDay(date: string): string {
  return toDay(addDays(toDate(date), -1))
}

export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function keyOf({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>): string {
  return `${dueOn} ${dueTime ?? ''}`
}

export function dueId(due: Due): string {
  return `${due.periodId} ${keyOf(due)}`
}

export function dueOf({ periodId, dueOn, dueTime }: Due): Due {
  return { periodId, dueOn, dueTime }
}

export function sameDue(a: Due, b: Due): boolean {
  return dueId(a) === dueId(b)
}

export function uniqueSorted(dues: Due[]): Due[] {
  const unique = new Map(dues.map((due) => [dueId(due), due]))
  return [...unique.values()].sort((a, b) => compareText(keyOf(a), keyOf(b)))
}

export function latestOf(days: (string | null | undefined)[]): string | undefined {
  return days
    .filter((day) => day !== null && day !== undefined)
    .sort(compareText)
    .at(-1)
}
