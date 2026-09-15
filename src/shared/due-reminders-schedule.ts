import { compareAsc } from 'date-fns'

import * as notifications from '@/core/notifications'
import type { Reminder } from '@/core/notifications'
import { dueReminderKeys, type DueReminderEntry } from './due-reminders'

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

type CancelPort = Pick<ReminderNotifications, 'cancelReminder'>

async function cancelKeys(port: CancelPort, entry: DueReminderEntry): Promise<void> {
  for (const key of dueReminderKeys(entry)) await port.cancelReminder(key)
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
      await cancelKeys(port, entry)
      if (!(await port.checkPermission())) return
      const reminders = await build()
      if (reminders.length === 0) return
      const room = MAX_SCHEDULED_REMINDERS - (await port.listScheduled()).length
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
      for (const entry of entries) await cancelKeys(port, entry)
    } catch (cause) {
      warn(cause)
    }
  })
}
