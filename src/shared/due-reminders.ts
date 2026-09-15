import { addDays, compareAsc, format, isAfter, parseISO, set } from 'date-fns'

import type { Reminder } from '@/core/notifications'
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
    for (const moment of Object.keys(OFFSETS) as DueReminderMoment[]) {
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
        },
      })
    }
  })

  return [...byInstant.values()]
    .map(({ reminder }) => reminder)
    .sort((a, b) => compareAsc(a.at, b.at))
}
