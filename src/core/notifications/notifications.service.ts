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

/** Remplace le rappel de même clé s'il existe déjà ; sans permission accordée, ne programme rien. */
export async function scheduleReminder(reminder: Reminder): Promise<void> {
  // Sur Android 13+, `schedule()` ouvrirait la popup système sans l'écran d'explication.
  if (!(await checkPermission())) return
  await scheduleOnRemindersChannel([reminder])
}

/** Sans effet si aucun rappel ne porte cette clé. */
export async function cancelReminder(key: string): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: reminderNotificationId(key) }] })
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
 * Programme la liste par lots, puis annule ce qu'elle ne reprend pas, y compris d'une session
 * précédente. Un échec laisse donc les rappels en place et se propage : rien ne se dit à jour.
 * Sans permission accordée, ne reprogramme rien.
 */
export async function rescheduleAll(reminders: Reminder[]): Promise<void> {
  const { notifications: pending } = await LocalNotifications.getPending()
  const scheduled = new Set<number>()

  try {
    if (reminders.length > 0 && (await checkPermission())) {
      for (const batch of batches(reminders)) {
        await scheduleOnRemindersChannel(batch)
        for (const { key } of batch) scheduled.add(reminderNotificationId(key))
      }
    }
  } catch (cause) {
    console.warn(
      `Rappels : ${scheduled.size} programmés sur ${reminders.length}, rien annulé`,
      cause,
    )
    throw cause
  }

  const obsolete = pending.filter(({ id }) => !scheduled.has(id))
  if (obsolete.length > 0) {
    await LocalNotifications.cancel({ notifications: obsolete.map(({ id }) => ({ id })) })
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
