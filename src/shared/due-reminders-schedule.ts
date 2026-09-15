import { compareAsc, isAfter } from 'date-fns'

import * as notifications from '@/core/notifications'
import type { Reminder, ScheduledReminder } from '@/core/notifications'
import { dueReminderPrefix, type DueReminderEntry } from './due-reminders'

export type ReminderNotifications = Pick<
  typeof notifications,
  'checkPermission' | 'scheduleReminder' | 'cancelReminder' | 'rescheduleAll' | 'listScheduled'
>

export const reminderNotifications: ReminderNotifications = notifications

/** Sous le plafond d'alarmes d'Android (~500), au-delà duquel le plugin fait planter l'app. */
export const MAX_SCHEDULED_REMINDERS = 400

let queue: Promise<unknown> = Promise.resolve()
let fullSync: (() => Promise<void>) | null = null

/** Synchro complète appelée quand le plafond empêche de programmer un rappel plus proche. */
export function provideFullReminderSync(next: (() => Promise<void>) | null): void {
  fullSync = next
}

/** File unique : une synchro complète et une écriture ne s'entrelacent jamais chez le plugin. */
export function enqueueReminderTask<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task)
  queue = run.catch(() => undefined)
  return run
}

export function earliestReminders(reminders: Reminder[], limit: number): Reminder[] {
  return [...reminders].sort((a, b) => compareAsc(a.at, b.at)).slice(0, Math.max(limit, 0))
}

function warn(cause: unknown): void {
  console.warn('Rappels non mis à jour :', cause)
}

type CancelPort = Pick<ReminderNotifications, 'cancelReminder' | 'listScheduled'>

/** Le plugin peut rendre l'heure en texte : `new Date` accepte les deux formes. */
export function pendingTime({ at }: ScheduledReminder): number | null {
  return at === undefined ? null : new Date(at).getTime()
}

/** Renvoie les rappels encore en attente et à venir après l'annulation. */
async function cancelPending(
  port: CancelPort,
  entries: DueReminderEntry[],
): Promise<ScheduledReminder[]> {
  const prefixes = entries.map(dueReminderPrefix)
  const matches = ({ key }: ScheduledReminder) =>
    key !== undefined && prefixes.some((prefix) => key.startsWith(prefix))
  const pending = await port.listScheduled()
  for (const { key } of pending.filter(matches))
    if (key !== undefined) await port.cancelReminder(key)
  const now = Date.now()
  return pending.filter(
    (reminder) => !matches(reminder) && (pendingTime(reminder) ?? now + 1) > now,
  )
}

function pushesOutFartherPending(reminder: Reminder, pending: ScheduledReminder[]): boolean {
  return pending.some((scheduled) => {
    const time = pendingTime(scheduled)
    return time !== null && isAfter(time, reminder.at)
  })
}

/**
 * Ne lève jamais : l'écriture en base est déjà faite, et la synchronisation complète au retour
 * au premier plan rattrape un échec. Sans permission, rien n'est programmé.
 */
export function replaceDueReminders(
  port: ReminderNotifications,
  entry: DueReminderEntry,
  build: () => Reminder[] | Promise<Reminder[]>,
): Promise<void> {
  return enqueueReminderTask(async () => {
    try {
      const remaining = await cancelPending(port, [entry])
      if (!(await port.checkPermission())) return
      const reminders = await build()
      const kept = earliestReminders(reminders, MAX_SCHEDULED_REMINDERS - remaining.length)
      for (const reminder of kept) await port.scheduleReminder(reminder)
      const firstLeftOut = earliestReminders(reminders, reminders.length)[kept.length]
      if (firstLeftOut && pushesOutFartherPending(firstLeftOut, remaining)) void fullSync?.()
    } catch (cause) {
      warn(cause)
    }
  })
}

/** Ne lève jamais. Annuler ne demande pas la permission. */
export function cancelDueReminders(port: CancelPort, entries: DueReminderEntry[]): Promise<void> {
  return enqueueReminderTask(async () => {
    try {
      await cancelPending(port, entries)
    } catch (cause) {
      warn(cause)
    }
  })
}
