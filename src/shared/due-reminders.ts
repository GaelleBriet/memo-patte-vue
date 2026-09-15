import { addDays, compareAsc, isAfter, parseISO, set } from 'date-fns'

import type { Reminder } from '@/core/notifications'
import type { ReminderKind } from './reminders'

export type DueReminderMoment = 'before' | 'due' | 'overdue'

export type DueReminderEntry = { kind: ReminderKind; id: string }

export type DueReminderSource = DueReminderEntry & {
  /** Date civile `yyyy-MM-dd` ; `null` = pas de rappel. */
  dueDate: string | null
  /** Échéance précédente non honorée, relancée à la place de `dueDate` tant que sa relance est à venir. */
  missedDueDate?: string
}

export type DueReminderTexts = (moment: DueReminderMoment) => { title: string; body: string }

export type Translate = (key: string, named: Record<string, unknown>) => string

export const DAYS_BEFORE_DUE = 3
export const DAYS_OVERDUE = 3

/** Le plafond d'alarmes Android (~500) interdit de tout programmer : la synchro suivante remplit la suite. */
export const REMINDER_WINDOW_DAYS = 60

const REMINDER_HOUR = 9

const MOMENTS: readonly DueReminderMoment[] = ['before', 'due', 'overdue']

function reminderKey({ kind, id }: DueReminderEntry, moment: DueReminderMoment): string {
  return `${kind}:${id}:${moment}`
}

export function dueReminderKeys(entry: DueReminderEntry): string[] {
  return MOMENTS.map((moment) => reminderKey(entry, moment))
}

function at(date: string, offsetDays: number): Date {
  return set(addDays(parseISO(date), offsetDays), { hours: REMINDER_HOUR })
}

/** Instant du rappel « le jour même » d'une échéance, à 9 h heure locale. */
export function dueAt(date: string): Date {
  return at(date, 0)
}

/**
 * Rappels d'une échéance dans les 60 jours à venir, à 9 h heure locale : trois jours avant, le jour
 * même et trois jours après.
 */
export function dueReminders(
  source: DueReminderSource,
  texts: DueReminderTexts,
  now: Date,
): Reminder[] {
  const { dueDate, missedDueDate } = source
  if (dueDate === null) return []

  const windowEnd = addDays(now, REMINDER_WINDOW_DAYS)
  const missedOverdue = missedDueDate === undefined ? null : at(missedDueDate, DAYS_OVERDUE)
  const planned: [DueReminderMoment, Date][] = [
    ['before', at(dueDate, -DAYS_BEFORE_DUE)],
    ['due', dueAt(dueDate)],
    [
      'overdue',
      missedOverdue && isAfter(missedOverdue, now) ? missedOverdue : at(dueDate, DAYS_OVERDUE),
    ],
  ]

  return planned
    .filter(([, when]) => isAfter(when, now) && !isAfter(when, windowEnd))
    .sort(([, a], [, b]) => compareAsc(a, b))
    .map(([moment, when]) => ({ key: reminderKey(source, moment), ...texts(moment), at: when }))
}
