import { LocalNotifications } from '@capacitor/local-notifications'
import type {
  LocalNotificationSchema,
  PendingLocalNotificationSchema,
} from '@capacitor/local-notifications'

import {
  assignReminderIds,
  type IdentifiedReminder,
  type Reminder,
  type ScheduledReminder,
} from './reminder'
import { canScheduleExact } from './exact-reminders'
import { registerReminderActions } from './reminder-actions'
import { ensureRemindersChannel, remindersGranted, REMINDERS_CHANNEL_ID } from './reminders-channel'

function extraText(
  notification: PendingLocalNotificationSchema,
  name: 'key' | 'actionTypeId',
): string | undefined {
  const value: unknown = notification.extra?.[name]

  return typeof value === 'string' ? value : undefined
}

function reminderKey(notification: PendingLocalNotificationSchema): string | undefined {
  return extraText(notification, 'key')
}

function scheduledIdsByKey(pending: PendingLocalNotificationSchema[]): Map<string, number> {
  const ids = new Map<string, number>()

  for (const notification of pending) {
    const key = reminderKey(notification)
    if (key !== undefined) ids.set(key, notification.id)
  }

  return ids
}

function toPluginNotification(
  { reminder, id }: IdentifiedReminder,
  exact: boolean,
): LocalNotificationSchema {
  const { actionTypeId } = reminder
  // `getPending` ne rend pas `actionTypeId` : `extra` le garde pour l'empreinte des rappels programmés.
  const action = actionTypeId === undefined ? {} : { actionTypeId }

  return {
    id,
    title: reminder.title,
    body: reminder.body,
    // `allowWhileIdle` traverse le mode Doze, en alarme exacte comme inexacte.
    schedule: { at: reminder.at, allowWhileIdle: true },
    // Sans l'accès, `true` ferait ouvrir au plugin l'écran système « Alarmes et rappels ».
    isExactNotification: exact,
    channelId: REMINDERS_CHANNEL_ID,
    ...action,
    extra: { key: reminder.key, exact, ...action },
  }
}

function toScheduledReminder(notification: PendingLocalNotificationSchema): ScheduledReminder {
  return {
    id: notification.id,
    key: reminderKey(notification),
    title: notification.title,
    body: notification.body,
    at: notification.schedule?.at,
    actionTypeId: extraText(notification, 'actionTypeId'),
    exact: notification.extra?.exact === true,
  }
}

/** Un seul appel au plugin pour toute la liste ; sans effet pour une clé sans rappel en attente. */
export async function cancelReminders(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const { notifications: pending } = await LocalNotifications.getPending()
  const scheduledIds = scheduledIdsByKey(pending)
  const notifications = keys.flatMap((key) => {
    const id = scheduledIds.get(key)
    return id === undefined ? [] : [{ id }]
  })
  if (notifications.length > 0) await LocalNotifications.cancel({ notifications })
}

export async function listScheduled(): Promise<ScheduledReminder[]> {
  const { notifications } = await LocalNotifications.getPending()

  return notifications.map(toScheduledReminder)
}

/** Au-delà, la transaction vers le service Android grossit jusqu'à être refusée. */
export const SCHEDULE_BATCH_SIZE = 50

function batches(reminders: IdentifiedReminder[]): IdentifiedReminder[][] {
  const chunks: IdentifiedReminder[][] = []

  for (let start = 0; start < reminders.length; start += SCHEDULE_BATCH_SIZE) {
    chunks.push(reminders.slice(start, start + SCHEDULE_BATCH_SIZE))
  }

  return chunks
}

/** Sous le plafond d'Android (~500), l'ancien et le nouveau tiennent ensemble. */
export const SCHEDULE_FIRST_LIMIT = 480

async function cancelIds(ids: number[]): Promise<void> {
  if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) })
}

/**
 * Remplace tout ce qui est en attente, y compris d'une session précédente, par la liste programmée
 * par lots. Quand l'appareil peut porter l'ancien et le nouveau ensemble, la liste est programmée
 * avant l'annulation de l'obsolète : un échec laisse l'ancien en place ; sinon, l'obsolète est
 * annulé d'abord. Sur une liste vide ou sans permission accordée, annule tout sans rien programmer.
 */
export async function rescheduleAll(reminders: Reminder[]): Promise<void> {
  const { notifications: pending } = await LocalNotifications.getPending()
  const granted = reminders.length > 0 && (await checkPermission())
  const wantedKeys = new Set(granted ? reminders.map(({ key }) => key) : [])
  const kept = new Map([...scheduledIdsByKey(pending)].filter(([key]) => wantedKeys.has(key)))
  const added = granted ? reminders.filter(({ key }) => !kept.has(key)).length : 0
  const scheduleFirst = granted && pending.length + added <= SCHEDULE_FIRST_LIMIT
  const identified = granted ? assignReminderIds(reminders, kept) : []
  const wanted = new Set(identified.map(({ id }) => id))
  const obsolete = pending.filter(({ id }) => !wanted.has(id)).map(({ id }) => id)

  if (!scheduleFirst) await cancelIds(obsolete)
  if (!granted) return

  let scheduled = 0
  try {
    await ensureRemindersChannel()
    await registerReminderActions()
    const exact = await canScheduleExact()
    for (const batch of batches(identified)) {
      await LocalNotifications.schedule({
        notifications: batch.map((each) => toPluginNotification(each, exact)),
      })
      scheduled += batch.length
    }
  } catch (cause) {
    console.warn(`Rappels : ${scheduled} programmés sur ${reminders.length}`, cause)
    throw cause
  }
  if (scheduleFirst) await cancelIds(obsolete)
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
  const { notifications: pending } = await LocalNotifications.getPending()
  const identified = assignReminderIds(reminders, scheduledIdsByKey(pending))
  await ensureRemindersChannel()
  await registerReminderActions()
  const exact = await canScheduleExact()
  await LocalNotifications.schedule({
    notifications: identified.map((each) => toPluginNotification(each, exact)),
  })
}

/** Tout ce que l'app a programmé ou affiché, y compris d'une session précédente. */
export async function cancelAllNotifications(): Promise<void> {
  const { notifications: pending } = await LocalNotifications.getPending()
  await cancelIds(pending.map(({ id }) => id))
  await LocalNotifications.removeAllDeliveredNotifications()
}

/** Retire du volet des notifications déjà affichées ; `cancel` ne touche qu'aux rappels à venir. */
export async function removeDelivered(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  await LocalNotifications.removeDeliveredNotificationsById({ ids })
}
