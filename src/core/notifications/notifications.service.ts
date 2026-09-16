import { LocalNotifications } from '@capacitor/local-notifications'
import type {
  LocalNotificationSchema,
  PendingLocalNotificationSchema,
} from '@capacitor/local-notifications'

import { reminderNotificationId, type Reminder, type ScheduledReminder } from './reminder'
import { ensureRemindersChannel, remindersGranted, REMINDERS_CHANNEL_ID } from './reminders-channel'

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
    channelId: REMINDERS_CHANNEL_ID,
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

async function scheduleOnRemindersChannel(reminders: Reminder[]): Promise<void> {
  await ensureRemindersChannel()
  await LocalNotifications.schedule({ notifications: reminders.map(toPluginNotification) })
}

/** Un seul appel au plugin pour toute la liste ; sans effet pour une clé sans rappel. */
export async function cancelReminders(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await LocalNotifications.cancel({
    notifications: keys.map((key) => ({ id: reminderNotificationId(key) })),
  })
}

export async function listScheduled(): Promise<ScheduledReminder[]> {
  const { notifications } = await LocalNotifications.getPending()

  return notifications.map(toScheduledReminder)
}

/** Au-delà, la transaction vers le service Android grossit jusqu'à être refusée. */
export const SCHEDULE_BATCH_SIZE = 50

function batches(reminders: Reminder[]): Reminder[][] {
  const chunks: Reminder[][] = []

  for (let start = 0; start < reminders.length; start += SCHEDULE_BATCH_SIZE) {
    chunks.push(reminders.slice(start, start + SCHEDULE_BATCH_SIZE))
  }

  return chunks
}

/**
 * Annule ce que la liste ne reprend pas, y compris d'une session précédente, puis la programme par
 * lots. Dans cet ordre, l'appareil ne porte jamais l'ancien et le nouveau à la fois, et un échec
 * laisse en place les rappels toujours voulus sans se dire à jour. Sur une liste vide ou sans
 * permission accordée, annule tout sans rien reprogrammer.
 */
export async function rescheduleAll(reminders: Reminder[]): Promise<void> {
  const { notifications: pending } = await LocalNotifications.getPending()
  const granted = reminders.length > 0 && (await checkPermission())
  const wanted = new Set(granted ? reminders.map(({ key }) => reminderNotificationId(key)) : [])
  const obsolete = pending.filter(({ id }) => !wanted.has(id))

  if (obsolete.length > 0) {
    await LocalNotifications.cancel({ notifications: obsolete.map(({ id }) => ({ id })) })
  }
  if (!granted) return

  let scheduled = 0
  try {
    await ensureRemindersChannel()
    for (const batch of batches(reminders)) {
      await LocalNotifications.schedule({ notifications: batch.map(toPluginNotification) })
      scheduled += batch.length
    }
  } catch (cause) {
    console.warn(`Rappels : ${scheduled} programmés sur ${reminders.length}`, cause)
    throw cause
  }
}

/** Ne déclenche jamais de demande de permission. */
export async function checkPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.checkPermissions()

  return remindersGranted(display)
}

export async function requestPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.requestPermissions()

  return remindersGranted(display)
}

/** Un seul appel au plugin pour toute la liste ; sans permission accordée, ne programme rien. */
export async function scheduleReminders(reminders: Reminder[]): Promise<void> {
  if (reminders.length === 0 || !(await checkPermission())) return
  await scheduleOnRemindersChannel(reminders)
}
