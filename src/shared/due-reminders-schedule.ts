import { compareAsc } from 'date-fns'

import * as notifications from '@/core/notifications'
import type { Reminder } from '@/core/notifications'
import { dueReminderPrefix, type DueReminderEntry } from './due-reminders'

export type ReminderNotifications = Pick<
  typeof notifications,
  'checkPermission' | 'scheduleReminder' | 'cancelReminder' | 'rescheduleAll' | 'listScheduled'
>

export const reminderNotifications: ReminderNotifications = notifications

/** Sous le plafond d'alarmes d'Android (~500), au-delà duquel le plugin fait planter l'app. */
export const MAX_SCHEDULED_REMINDERS = 400

let queue: Promise<unknown> = Promise.resolve()

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

/** Renvoie le nombre de rappels encore en attente après l'annulation. */
async function cancelPending(port: CancelPort, entries: DueReminderEntry[]): Promise<number> {
  const prefixes = entries.map(dueReminderPrefix)
  const pending = await port.listScheduled()
  const doomed = pending.flatMap(({ key }) =>
    key !== undefined && prefixes.some((prefix) => key.startsWith(prefix)) ? [key] : [],
  )
  for (const key of doomed) await port.cancelReminder(key)
  return pending.length - doomed.length
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
      const room = MAX_SCHEDULED_REMINDERS - remaining
      for (const reminder of earliestReminders(reminders, room)) {
        await port.scheduleReminder(reminder)
      }
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
