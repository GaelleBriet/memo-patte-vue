import { differenceInCalendarDays } from 'date-fns'

import { compareText, toDate } from './calendar-day'
import { shiftDate, type Frequency } from './treatment-frequency'
import type { Due } from './treatment-schedule-types'

export function isWithinHalfStep(from: string, day: string, frequency: Frequency): boolean {
  const step = differenceInCalendarDays(toDate(shiftDate(from, frequency, 1)), toDate(from))
  return 2 * differenceInCalendarDays(toDate(day), toDate(from)) < step
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
