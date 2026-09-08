import { LocalNotifications } from '@capacitor/local-notifications'
import type {
  LocalNotificationSchema,
  PendingLocalNotificationSchema,
} from '@capacitor/local-notifications'

import { reminderNotificationId, type Reminder, type ScheduledReminder } from './reminder'

function toPluginNotification(reminder: Reminder): LocalNotificationSchema {
  return {
    id: reminderNotificationId(reminder.key),
    title: reminder.title,
    body: reminder.body,
    // `setAndAllowWhileIdle` traverse le mode Doze sans exiger d'alarme exacte.
    schedule: { at: reminder.at, allowWhileIdle: true },
    // Le plugin programme des alarmes exactes par défaut : sans ce `false`, il
    // ouvrirait l'écran système « Alarmes et rappels ».
    isExactNotification: false,
    extra: { key: reminder.key },
  }
}

function toScheduledReminder(notification: PendingLocalNotificationSchema): ScheduledReminder {
  const key: unknown = notification.extra?.key

  return {
    id: notification.id,
    key: typeof key === 'string' ? key : undefined,
    title: notification.title,
    body: notification.body,
    at: notification.schedule?.at,
  }
}

/** Remplace le rappel de même clé s'il existe déjà. */
export async function scheduleReminder(reminder: Reminder): Promise<void> {
  await LocalNotifications.schedule({ notifications: [toPluginNotification(reminder)] })
}

/** Sans effet si aucun rappel ne porte cette clé. */
export async function cancelReminder(key: string): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: reminderNotificationId(key) }] })
}

export async function listScheduled(): Promise<ScheduledReminder[]> {
  const { notifications } = await LocalNotifications.getPending()

  return notifications.map(toScheduledReminder)
}

/** Annule tout ce qui est en attente, y compris les rappels d'une session précédente. */
export async function rescheduleAll(reminders: Reminder[]): Promise<void> {
  const { notifications: pending } = await LocalNotifications.getPending()

  if (pending.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.map(({ id }) => ({ id })) })
  }

  if (reminders.length > 0) {
    await LocalNotifications.schedule({ notifications: reminders.map(toPluginNotification) })
  }
}

/** Ne déclenche jamais de demande de permission. */
export async function checkPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.checkPermissions()

  return display === 'granted'
}

export async function requestPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.requestPermissions()

  return display === 'granted'
}
