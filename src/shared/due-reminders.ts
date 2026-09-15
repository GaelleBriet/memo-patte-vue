import { isAfter, parseISO, set, subDays } from 'date-fns'

import type { Reminder } from '@/core/notifications'
import type { ReminderKind } from './reminders'

export type DueReminderMoment = 'before' | 'due'

export type DueReminderEntry = { kind: ReminderKind; id: string }

export type DueReminderSource = DueReminderEntry & {
  /** Date civile `yyyy-MM-dd` ; `null` = pas de rappel. */
  dueDate: string | null
}

export type DueReminderTexts = (moment: DueReminderMoment) => { title: string; body: string }

export type Translate = (key: string, named: Record<string, unknown>) => string

export const DAYS_BEFORE_DUE = 3

const REMINDER_HOUR = 9

const MOMENTS: readonly DueReminderMoment[] = ['before', 'due']

function reminderKey({ kind, id }: DueReminderEntry, moment: DueReminderMoment): string {
  return `${kind}:${id}:${moment}`
}

export function dueReminderKeys(entry: DueReminderEntry): string[] {
  return MOMENTS.map((moment) => reminderKey(entry, moment))
}

function reminderDay(dueDate: string, moment: DueReminderMoment): Date {
  const due = parseISO(dueDate)
  return moment === 'before' ? subDays(due, DAYS_BEFORE_DUE) : due
}

/** Rappels encore à venir d'une échéance : trois jours avant et le jour même, à 9 h heure locale. */
export function dueReminders(
  source: DueReminderSource,
  texts: DueReminderTexts,
  now: Date,
): Reminder[] {
  const { dueDate } = source
  if (dueDate === null) return []

  return MOMENTS.flatMap((moment) => {
    const at = set(reminderDay(dueDate, moment), { hours: REMINDER_HOUR })
    if (!isAfter(at, now)) return []
    return [{ key: reminderKey(source, moment), ...texts(moment), at }]
  })
}
