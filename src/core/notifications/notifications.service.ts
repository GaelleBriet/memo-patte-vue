import { LocalNotifications } from '@capacitor/local-notifications'
import type {
  LocalNotificationSchema,
  PendingLocalNotificationSchema,
} from '@capacitor/local-notifications'

import { reminderNotificationId, type Reminder, type ScheduledReminder } from './reminder'

/**
 * Seul point d'accès à `@capacitor/local-notifications` : les features ne
 * doivent jamais importer le plugin directement.
 *
 * Android uniquement. Toutes les alarmes sont **inexactes** : un rappel de
 * vaccin n'a pas besoin de la seconde près, et déclarer `SCHEDULE_EXACT_ALARM`
 * ou `USE_EXACT_ALARM` imposerait une déclaration Play Console
 * (cf. `docs/technical/conformite-play-store-rgpd.md` §1.5).
 *
 * Ce service ne produit aucun texte visible : `title` et `body` arrivent déjà
 * traduits depuis les features (vue-i18n).
 */

function toPluginNotification(reminder: Reminder): LocalNotificationSchema {
  return {
    id: reminderNotificationId(reminder.key),
    title: reminder.title,
    body: reminder.body,
    // `allowWhileIdle` reste compatible avec une alarme inexacte : le plugin
    // utilise alors `setAndAllowWhileIdle`, qui traverse le mode Doze.
    schedule: { at: reminder.at, allowWhileIdle: true },
    // Le plugin programme des alarmes exactes par défaut : on désactive
    // explicitement, sinon il ouvrirait l'écran système « Alarmes et rappels ».
    isExactNotification: false,
    // Permet de retrouver la clé métier dans `listScheduled()`.
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

/** Programme (ou remplace, l'identifiant étant dérivé de la clé) un rappel. */
export async function scheduleReminder(reminder: Reminder): Promise<void> {
  await LocalNotifications.schedule({ notifications: [toPluginNotification(reminder)] })
}

/** Annule le rappel correspondant à une clé métier, qu'il existe ou non. */
export async function cancelReminder(key: string): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: reminderNotificationId(key) }] })
}

/** Liste les rappels encore en attente de déclenchement. */
export async function listScheduled(): Promise<ScheduledReminder[]> {
  const { notifications } = await LocalNotifications.getPending()

  return notifications.map(toScheduledReminder)
}

/**
 * Annule tous les rappels en attente puis reprogramme la liste fournie.
 * Utilisé après une restauration de données pour repartir d'un état propre.
 */
export async function rescheduleAll(reminders: Reminder[]): Promise<void> {
  const { notifications: pending } = await LocalNotifications.getPending()

  if (pending.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.map(({ id }) => ({ id })) })
  }

  if (reminders.length > 0) {
    await LocalNotifications.schedule({ notifications: reminders.map(toPluginNotification) })
  }
}

/** Indique si les notifications sont autorisées, sans jamais rien demander. */
export async function checkPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.checkPermissions()

  return display === 'granted'
}

/**
 * Demande la permission `POST_NOTIFICATIONS`. À n'appeler qu'en contexte
 * (création du premier rappel), jamais au lancement de l'application.
 */
export async function requestPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.requestPermissions()

  return display === 'granted'
}
