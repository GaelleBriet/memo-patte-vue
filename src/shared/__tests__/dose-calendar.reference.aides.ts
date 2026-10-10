import {
  referenceReading,
  type ReferenceFrequency,
  type ReferenceLine,
  type ReferenceSetting,
} from '../domain/dose-calendar/reference-model'

export const DAY: ReferenceFrequency = { value: 1, unit: 'day' }
export const TWO_DAYS: ReferenceFrequency = { value: 2, unit: 'day' }
export const WEEK: ReferenceFrequency = { value: 1, unit: 'week' }
export const MONTH: ReferenceFrequency = { value: 1, unit: 'month' }
export const H = ['08:00', '20:00']

let stamp = 0

export function setting(
  id: string,
  firstDueOn: string,
  frequency: ReferenceFrequency,
  times: string[] = [],
  extra: Partial<ReferenceSetting> = {},
): ReferenceSetting {
  stamp += 1
  return {
    id,
    startsOn: firstDueOn,
    firstDueOn,
    gridOriginOn: firstDueOn,
    endsOn: null,
    stoppedOn: null,
    frequency,
    times,
    createdAt: `2026-01-01T00:00:${String(stamp).padStart(2, '0')}.000Z`,
    ...extra,
  }
}

export function line(
  settingId: string,
  status: ReferenceLine['status'],
  dueOn: string,
  dueTime: string | null = null,
  targetOn: string | null = null,
): ReferenceLine {
  stamp += 1
  return {
    id: `l${stamp}`,
    settingId,
    dueOn,
    dueTime,
    status,
    targetOn,
    updatedAt: `2026-01-01T00:01:${String(stamp).padStart(2, '0')}.000Z`,
  }
}

export function read(settings: ReferenceSetting[], lines: ReferenceLine[], today: string) {
  return referenceReading({ settings, lines, today, until: '2026-12-31' })
}

export function next(
  settings: ReferenceSetting[],
  lines: ReferenceLine[],
  today: string,
  count = 3,
) {
  const reading = read(settings, lines, today)
  return [...new Set([...reading.current, ...reading.upcoming])].slice(0, count)
}
