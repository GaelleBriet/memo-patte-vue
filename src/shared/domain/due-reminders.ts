import { addDays, compareAsc, format, isAfter, parseISO, set, subDays } from 'date-fns'

import { REMINDER_DONE_ACTION_TYPE, type Reminder } from '@/core/notifications'
import { isClockTime } from './clock-time'
import type { ReminderKind } from './reminders'

export type DueReminderMoment = 'before' | 'due' | 'overdue'

export type DueReminderEntry = { kind: ReminderKind; id: string }

export type DueReminderTexts = (moment: DueReminderMoment) => { title: string; body: string }

export type Translate = (key: string, named: Record<string, unknown>) => string

export const DAYS_BEFORE_DUE = 3
export const DAYS_OVERDUE = 3

/** Horizon des cycles suivants d'un traitement, sous le plafond d'alarmes Android (~500). */
export const REMINDER_WINDOW_DAYS = 60

const REMINDER_HOUR = 9

/** À la même heure, un seul rappel sonne : le jour même, sinon la relance. */
const PRIORITY: Record<DueReminderMoment, number> = { due: 0, overdue: 1, before: 2 }

const OFFSETS: Record<DueReminderMoment, number> = {
  before: -DAYS_BEFORE_DUE,
  due: 0,
  overdue: DAYS_OVERDUE,
}

const MOMENTS = Object.keys(OFFSETS) as DueReminderMoment[]

/** Trois jours avant, « C'est fait » noterait une prise trop tôt et décalerait tout le cycle. */
const WITH_DONE_ACTION: ReadonlySet<DueReminderMoment> = new Set(['due', 'overdue'])

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

  if (dueTime === undefined || !(MOMENTS as string[]).includes(moment)) return null

  return { entry: `${kind}:${id}`, dueDate, dueTime, moment: moment as DueReminderMoment }
}

/** Clé de l'ancienne forme, sans heure : sa notification garde le geste d'avant (Q32). */
export function isLegacyReminderKey(key: string): boolean {
  return parseReminderKey(key) !== null && key.split(':').length === 4
}

function at(dueDate: string, offsetDays: number): Date {
  return set(addDays(parseISO(dueDate), offsetDays), { hours: REMINDER_HOUR })
}

export function reminderWindowEnd(now: Date): Date {
  return addDays(now, REMINDER_WINDOW_DAYS)
}

/** Premier et dernier rappel d'une échéance : trois jours avant et trois jours après. */
export function dueReminderSpan(dueDate: string): { first: Date; last: Date } {
  return { first: at(dueDate, OFFSETS.before), last: at(dueDate, OFFSETS.overdue) }
}

/** Une prise ou une injection faite moins de trois jours avant l'échéance, ou après, vaut pour elle. */
export function isDoneForDue(dueDate: string, lastDoneOn: string | null): boolean {
  const earliest = format(subDays(parseISO(dueDate), DAYS_BEFORE_DUE), 'yyyy-MM-dd')
  return lastDoneOn !== null && lastDoneOn > earliest
}

/** Vrai tant que le rappel du jour même n'a pas sonné. */
export function isDueUpcoming(dueDate: string, now: Date): boolean {
  return isAfter(at(dueDate, OFFSETS.due), now)
}

/** Un rappel qui tombe sur l'échéance voisine ou la dépasse ferait doublon avec elle. */
function spillsOverNeighbour(
  moment: DueReminderMoment,
  day: string,
  previous: string | undefined,
  next: string | undefined,
): boolean {
  if (moment === 'overdue') return next !== undefined && day >= next
  if (moment === 'before') return previous !== undefined && day <= previous
  return false
}

/**
 * Rappels des échéances, à 9 h heure locale : trois jours avant, le jour même et trois jours après.
 * La première échéance à venir est toujours programmée ; les suivantes, dans les 60 jours seulement.
 * Triés dans le temps, un seul par instant.
 */
export function dueReminders(
  entry: DueReminderEntry,
  dueDates: readonly string[],
  texts: DueReminderTexts,
  now: Date,
): Reminder[] {
  const windowEnd = reminderWindowEnd(now)
  const dates = [...new Set(dueDates)].sort()
  const firstUpcoming = dates.find((dueDate) => isDueUpcoming(dueDate, now))
  const byInstant = new Map<number, { moment: DueReminderMoment; reminder: Reminder }>()

  dates.forEach((dueDate, index) => {
    for (const moment of MOMENTS) {
      const when = at(dueDate, OFFSETS[moment])
      if (!isAfter(when, now)) continue
      if (dueDate !== firstUpcoming && isAfter(when, windowEnd)) continue
      if (
        spillsOverNeighbour(moment, format(when, 'yyyy-MM-dd'), dates[index - 1], dates[index + 1])
      ) {
        continue
      }
      const kept = byInstant.get(when.getTime())
      if (kept && PRIORITY[kept.moment] <= PRIORITY[moment]) continue
      byInstant.set(when.getTime(), {
        moment,
        reminder: {
          key: `${dueReminderPrefix(entry)}${dueDate}:${moment}`,
          ...texts(moment),
          at: when,
          ...(WITH_DONE_ACTION.has(moment) ? { actionTypeId: REMINDER_DONE_ACTION_TYPE } : {}),
        },
      })
    }
  })

  return [...byInstant.values()]
    .map(({ reminder }) => reminder)
    .sort((a, b) => compareAsc(a.at, b.at))
}
