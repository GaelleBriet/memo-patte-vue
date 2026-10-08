import { addDays, addMonths, addWeeks } from 'date-fns'

import { toDate, toDay } from './calendar-day'

export const FREQUENCY_UNITS = ['day', 'week', 'month'] as const
export type Frequency = { value: number; unit: (typeof FREQUENCY_UNITS)[number] }

/** Au-delà, la saisie n'a plus de sens pour un carnet ; le moteur d'échéances la refuse aussi. */
export const MAX_FREQUENCY_VALUE = 365

export const DAYS_PER_STEP = { day: 1, week: 7, month: 28 }

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
