import * as notifications from '@/core/notifications'
import type { Reminder } from '@/core/notifications'
import { dueReminderKeys, type DueReminderEntry } from './due-reminders'

export type ReminderNotifications = Pick<
  typeof notifications,
  'checkPermission' | 'scheduleReminder' | 'cancelReminder' | 'rescheduleAll'
>

export const reminderNotifications: ReminderNotifications = notifications

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
export async function replaceDueReminders(
  port: ReminderNotifications,
  entry: DueReminderEntry,
  build: () => Reminder[] | Promise<Reminder[]>,
): Promise<void> {
  try {
    await cancelKeys(port, entry)
    if (!(await port.checkPermission())) return
    for (const reminder of await build()) await port.scheduleReminder(reminder)
  } catch (cause) {
    warn(cause)
  }
}

/** Ne lève jamais. Annuler ne demande pas la permission. */
export async function cancelDueReminders(
  port: CancelPort,
  entries: DueReminderEntry[],
): Promise<void> {
  try {
    for (const entry of entries) await cancelKeys(port, entry)
  } catch (cause) {
    warn(cause)
  }
}
