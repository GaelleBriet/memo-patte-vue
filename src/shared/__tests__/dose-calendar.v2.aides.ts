import { addDays, format, parseISO } from 'date-fns'

import { treatmentView } from '../domain/dose-calendar'
import type { Frequency, Line, Setting } from '../domain/dose-calendar/types'

export const DAY: Frequency = { value: 1, unit: 'day' }
export const TWO_DAYS: Frequency = { value: 2, unit: 'day' }
export const WEEK: Frequency = { value: 1, unit: 'week' }
export const MONTH: Frequency = { value: 1, unit: 'month' }
export const H = ['08:00', '20:00']

let stamp = 0
const at = () => {
  stamp += 1
  return `2026-01-01T00:${String(Math.floor(stamp / 60)).padStart(2, '0')}:${String(stamp % 60).padStart(2, '0')}.000Z`
}

/** Dates civiles de `from` à `to` inclus. */
export function days(from: string, to: string): string[] {
  const result: string[] = []
  for (let day = parseISO(from); format(day, 'yyyy-MM-dd') <= to; day = addDays(day, 1)) {
    result.push(format(day, 'yyyy-MM-dd'))
  }
  return result
}

export function setting(
  id: string,
  firstDueOn: string,
  frequency: Frequency,
  times: string[] = [],
  extra: Partial<Setting> = {},
): Setting {
  return {
    id,
    startsOn: firstDueOn,
    firstDueOn,
    gridOriginOn: firstDueOn,
    endsOn: null,
    stoppedOn: null,
    frequency,
    times,
    createdAt: at(),
    ...extra,
  }
}

export function line(
  settingId: string,
  status: Line['status'],
  dueOn: string,
  dueTime: string | null = null,
  targetOn: string | null = null,
): Line {
  const updatedAt = at()
  const givenOn = status === 'given' || status === 'extra' ? dueOn : null
  return { id: `l${stamp}`, settingId, dueOn, dueTime, status, givenOn, targetOn, updatedAt }
}

export function view(settings: Setting[], lines: Line[], today: string) {
  return treatmentView({ settings, lines, today })
}

export const keys = (dues: { dueOn: string; dueTime: string | null }[]) =>
  dues.map(({ dueOn, dueTime }) => (dueTime === null ? dueOn : `${dueOn} ${dueTime}`))

/** Doses du moment puis échéances à venir, sans doublon. */
export function next(settings: Setting[], lines: Line[], today: string, count = 3): string[] {
  const read = view(settings, lines, today)
  return [...new Set(keys([...read.currentDoses, ...read.upcoming()]))].slice(0, count)
}
