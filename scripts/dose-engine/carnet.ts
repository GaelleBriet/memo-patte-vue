import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from 'date-fns'

import type {
  Due,
  Frequency,
  TreatmentDoseInput,
  TreatmentPeriodInput,
} from '@/shared/domain/treatment-schedule'

export type Book = { periods: TreatmentPeriodInput[]; doses: TreatmentDoseInput[]; today: string }
export type Random = () => number

export const FREQUENCIES: Frequency[] = [
  { value: 1, unit: 'day' },
  { value: 2, unit: 'day' },
  { value: 3, unit: 'day' },
  { value: 1, unit: 'week' },
  { value: 2, unit: 'week' },
  { value: 6, unit: 'week' },
  { value: 1, unit: 'month' },
  { value: 3, unit: 'month' },
]

export const TIMES = [
  [],
  ['20:00'],
  ['08:00', '20:00'],
  ['08:00', '14:00', '20:00'],
  ['06:00', '12:00', '18:00', '23:00'],
]

export function mulberry32(seed: number): Random {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function int(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

export function pick<T>(random: Random, items: readonly T[]): T | undefined {
  return items[int(random, 0, items.length - 1)]
}

export function plusDays(day: string, count: number): string {
  return format(addDays(parseISO(day), count), 'yyyy-MM-dd')
}

export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from))
}

export function shifted(day: string, { value, unit }: Frequency, steps: number): string {
  const start = parseISO(day)
  const amount = value * steps
  const end =
    unit === 'day'
      ? addDays(start, amount)
      : unit === 'week'
        ? addWeeks(start, amount)
        : addMonths(start, amount)
  return format(end, 'yyyy-MM-dd')
}

export function idOf({ periodId, dueOn, dueTime }: Due): string {
  return `${periodId} ${dueOn} ${dueTime ?? ''}`
}

export function isNote({ status }: Pick<TreatmentDoseInput, 'status'>): boolean {
  return status === 'given' || status === 'missed'
}

export function familyOf({ status }: Pick<TreatmentDoseInput, 'status'>): string {
  return isNote({ status }) ? 'note' : status
}

export function newBook(random: Random): Book {
  const firstDueOn = plusDays('2026-03-01', int(random, 0, 40))
  const period: TreatmentPeriodInput = {
    id: 'p1',
    startsOn: firstDueOn,
    firstDueOn,
    referenceOn: firstDueOn,
    endsOn: random() < 0.3 ? plusDays(firstDueOn, int(random, 3, 60)) : null,
    stoppedOn: null,
    frequency: pick(random, FREQUENCIES) ?? { value: 1, unit: 'day' },
    times: pick(random, TIMES) ?? [],
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  return { periods: [period], doses: [], today: plusDays(firstDueOn, int(random, -2, 3)) }
}

// Date de fin proche : la dernière dose est la deuxième ou la troisième de la période.
export function withCloseEnd(book: Book, steps: number): Book {
  const periods = book.periods.map((period) => ({
    ...period,
    endsOn: shifted(period.firstDueOn, period.frequency, steps),
  }))
  return { ...book, periods }
}
