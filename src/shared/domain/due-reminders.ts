import { isClockTime } from './clock-time'
import type { ReminderKind } from './reminders'

export type DueReminderMoment = 'before' | 'due' | 'overdue'

export type DueReminderEntry = { kind: ReminderKind; id: string }

export type Translate = (key: string, named: Record<string, unknown>) => string

export const DAYS_BEFORE_DUE = 3
export const DAYS_OVERDUE = 3

const MOMENTS: readonly DueReminderMoment[] = ['before', 'due', 'overdue']

/** `kind:id` de l'entrée, tel que `parseReminderKey` le relit. */
export function dueReminderEntryKey({ kind, id }: DueReminderEntry): string {
  return `${kind}:${id}`
}

export function dueReminderPrefix(entry: DueReminderEntry): string {
  return `${dueReminderEntryKey(entry)}:`
}

export type ParsedReminderKey = {
  /** `kind:id` de l'entrée, sans l'échéance ni le moment. */
  entry: string
  dueDate: string
  /** `HH:mm` ; `null` pour une échéance sans heure ou une clé de l'ancienne forme. */
  dueTime: string | null
  moment: DueReminderMoment
}

/** `kind:id:jour:heure:moment`, l'heure sans « : » et vide pour une échéance sans heure. */
export function dueReminderKey(
  entry: DueReminderEntry,
  dueDate: string,
  dueTime: string | null,
  moment: DueReminderMoment,
): string {
  return `${dueReminderPrefix(entry)}${dueDate}:${dueTime?.replace(':', '') ?? ''}:${moment}`
}

function keyTime(compact: string): string | null | undefined {
  if (compact === '') return null
  const time = `${compact.slice(0, 2)}:${compact.slice(2)}`
  return compact.length === 4 && isClockTime(time) ? time : undefined
}

/** Lecture inverse des clés de `dueReminderKey` et de l'ancienne forme sans heure ; `null` sinon. */
export function parseReminderKey(key: string): ParsedReminderKey | null {
  const parts = key.split(':')
  if (parts.length !== 4 && parts.length !== 5) return null
  const [kind, id, dueDate] = parts as [string, string, string]
  const moment = parts.at(-1)!
  const dueTime = parts.length === 5 ? keyTime(parts[3]!) : null

  if (dueTime === undefined || !(MOMENTS as readonly string[]).includes(moment)) return null

  return { entry: `${kind}:${id}`, dueDate, dueTime, moment: moment as DueReminderMoment }
}

/** Clé de l'ancienne forme, sans heure : sa notification garde le geste d'avant (Q32). */
export function isLegacyReminderKey(key: string): boolean {
  return parseReminderKey(key) !== null && key.split(':').length === 4
}
