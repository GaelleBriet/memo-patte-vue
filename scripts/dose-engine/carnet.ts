import { addDays, format, parseISO } from 'date-fns'

import type { Frequency } from '@/shared/domain/dose-calendar'

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
