import { addDays, compareAsc, isAfter, parseISO, set } from 'date-fns'

import type { Reminder } from '@/core/notifications'
import type { ReminderKind } from './reminders'

export type DueReminderMoment = 'before' | 'due' | 'overdue'

export type DueReminderEntry = { kind: ReminderKind; id: string }

export type DueReminderTexts = (moment: DueReminderMoment) => { title: string; body: string }

export type Translate = (key: string, named: Record<string, unknown>) => string

export const DAYS_BEFORE_DUE = 3
export const DAYS_OVERDUE = 3

/** Le plafond d'alarmes Android (~500) interdit de tout programmer : la synchro suivante remplit la suite. */
export const REMINDER_WINDOW_DAYS = 60

const REMINDER_HOUR = 9

/** À la même heure, un seul rappel sonne : le jour même, sinon la relance. */
const PRIORITY: Record<DueReminderMoment, number> = { due: 0, overdue: 1, before: 2 }

const OFFSETS: Record<DueReminderMoment, number> = {
  before: -DAYS_BEFORE_DUE,
  due: 0,
  overdue: DAYS_OVERDUE,
}

export function dueReminderPrefix({ kind, id }: DueReminderEntry): string {
  return `${kind}:${id}:`
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

/**
 * Rappels des échéances dans les 60 jours à venir, à 9 h heure locale : trois jours avant, le jour
 * même et trois jours après. Triés dans le temps, un seul par instant.
 */
export function dueReminders(
  entry: DueReminderEntry,
  dueDates: readonly string[],
  texts: DueReminderTexts,
  now: Date,
): Reminder[] {
  const windowEnd = reminderWindowEnd(now)
  const byInstant = new Map<number, { moment: DueReminderMoment; reminder: Reminder }>()

  for (const dueDate of dueDates) {
    for (const moment of Object.keys(OFFSETS) as DueReminderMoment[]) {
      const when = at(dueDate, OFFSETS[moment])
      if (!isAfter(when, now) || isAfter(when, windowEnd)) continue
      const kept = byInstant.get(when.getTime())
      if (kept && PRIORITY[kept.moment] <= PRIORITY[moment]) continue
      byInstant.set(when.getTime(), {
        moment,
        reminder: {
          key: `${dueReminderPrefix(entry)}${dueDate}:${moment}`,
          ...texts(moment),
          at: when,
        },
      })
    }
  }

  return [...byInstant.values()]
    .map(({ reminder }) => reminder)
    .sort((a, b) => compareAsc(a.at, b.at))
}
