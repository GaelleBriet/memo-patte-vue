import { LocalNotifications } from '@capacitor/local-notifications'
import type { ActionPerformed } from '@capacitor/local-notifications'

import i18n from '@/core/i18n'

export const REMINDER_DONE_ACTION_TYPE = 'reminder-done'

const DONE_ACTION_ID = 'done'
/** Identifiant que le plugin donne au toucher de la notification elle-même. */
const TAP_ACTION_ID = 'tap'

/** `done` : bouton « C'est fait » ; `open` : notification touchée hors du bouton. */
export type ReminderAction = { key: string; action: 'done' | 'open' }

/** Le plugin fige le libellé à la programmation : à appeler avant chaque `schedule`. */
export async function registerReminderActions(): Promise<void> {
  const { t } = i18n.global
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: REMINDER_DONE_ACTION_TYPE,
          actions: [{ id: DONE_ACTION_ID, title: t('notifications.action.done') }],
        },
      ],
    })
  } catch {
    // Pas de bouton sur le web : la notification part sans.
  }
}

function toReminderAction({ actionId, notification }: ActionPerformed): ReminderAction | null {
  const key: unknown = notification?.extra?.key
  if (typeof key !== 'string') return null
  if (actionId === DONE_ACTION_ID) return { key, action: 'done' }
  if (actionId === TAP_ACTION_ID) return { key, action: 'open' }
  return null
}

/**
 * Une action faite app fermée est retenue par le plugin jusqu'au premier écouteur : l'inscrire tôt,
 * et une seule fois. Renvoie la désinscription.
 */
export function onReminderAction(listener: (action: ReminderAction) => void): () => void {
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const action = toReminderAction(event)
    if (action) listener(action)
  }).catch(() => null)
  return () => void handle.then((registered) => registered?.remove())
}
