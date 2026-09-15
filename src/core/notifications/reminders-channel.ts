import type { PermissionState } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

import i18n from '@/core/i18n'

export const REMINDERS_CHANNEL_ID = 'reminders'

const IMPORTANCE_NONE = 0
const IMPORTANCE_DEFAULT = 3

/** Crée le canal, ou remet son libellé dans la langue courante. */
export async function ensureRemindersChannel(): Promise<void> {
  const { t } = i18n.global
  try {
    await LocalNotifications.createChannel({
      id: REMINDERS_CHANNEL_ID,
      name: t('notifications.channel.name'),
      description: t('notifications.channel.description'),
      importance: IMPORTANCE_DEFAULT,
    })
  } catch {
    // Pas de canaux sur le web ni avant Android 8 : la notification part sans.
  }
}

/** Les rappels s'affichent : permission système accordée et canal des rappels non coupé dans les réglages. */
export async function remindersGranted(display: PermissionState): Promise<boolean> {
  return display === 'granted' && !(await isRemindersChannelMuted())
}

async function isRemindersChannelMuted(): Promise<boolean> {
  try {
    const { channels } = await LocalNotifications.listChannels()
    return channels.some(
      (channel) => channel.id === REMINDERS_CHANNEL_ID && channel.importance === IMPORTANCE_NONE,
    )
  } catch {
    return false
  }
}
