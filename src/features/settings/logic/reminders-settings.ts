import type { ExactRemindersStatus, NotificationPermissionStatus } from '@/core/notifications'

export type RemindersSummary = 'allowedExact' | 'allowed' | 'notYet' | 'off'

/** Sous-titre de la ligne : l'autorisation Android, puis l'effet quand les notifications ne sont pas autorisées. */
export type ExactRemindersHint =
  | 'allowed'
  | 'pitch'
  | 'off'
  | 'notYetOn'
  | 'notificationsOff'
  | 'allowedNotYetOn'
  | 'allowedNotificationsOff'
  | 'offNotYetOn'
  | 'offNotificationsOff'

export type ExactRemindersRow = {
  isOn: boolean
  hint: ExactRemindersHint
  notice: 'precise' | 'lessPrecise' | null
}

/**
 * Après « Plus tard », le statut dit `disabled` alors qu'Android n'a jamais demandé : l'écran
 * d'explication reste la voie (RA-21). `null` tant qu'on ne sait pas si Android a demandé.
 */
export function displayedNotificationsStatus(
  status: NotificationPermissionStatus | null,
  androidAsked: boolean | null,
): NotificationPermissionStatus | null {
  if (status !== 'disabled') return status
  if (androidAsked === null) return null
  return androidAsked ? 'disabled' : 'unasked'
}

/** Jamais demandées : l'écran d'explication d'abord ; refusées : seuls les réglages d'Android peuvent les rendre. */
export function enableRemindersRoute(
  notifications: NotificationPermissionStatus | null,
): 'priming' | 'androidSettings' | null {
  if (notifications === 'unasked') return 'priming'
  if (notifications === 'disabled') return 'androidSettings'
  return null
}

/** L'explication ne sert qu'à les activer : déjà accordés, Android directement (RA-23). */
export function exactRemindersAction(
  exact: ExactRemindersStatus | null,
): 'androidSettings' | 'explainer' {
  return exact === 'precise' ? 'androidSettings' : 'explainer'
}

export function remindersSummary(
  notifications: NotificationPermissionStatus | null,
  exact: ExactRemindersStatus | null,
): RemindersSummary | null {
  switch (notifications) {
    case 'granted':
      return exact === 'precise' ? 'allowedExact' : 'allowed'
    case 'unasked':
      return 'notYet'
    case 'disabled':
      return 'off'
    default:
      return null
  }
}

const WITHOUT_EFFECT_HINTS = {
  unasked: { precise: 'allowedNotYetOn', 'never-enabled': 'notYetOn', removed: 'offNotYetOn' },
  disabled: {
    precise: 'allowedNotificationsOff',
    'never-enabled': 'notificationsOff',
    removed: 'offNotificationsOff',
  },
} as const

/** `null` : la ligne n'a rien de vrai à montrer. */
export function exactRemindersRow(
  notifications: NotificationPermissionStatus | null,
  exact: ExactRemindersStatus | null,
): ExactRemindersRow | null {
  if (notifications === null || notifications === 'unavailable') return null
  if (exact === null || exact === 'unavailable') return null

  const isOn = exact === 'precise'
  if (notifications !== 'granted') {
    return { isOn, hint: WITHOUT_EFFECT_HINTS[notifications][exact], notice: null }
  }

  switch (exact) {
    case 'precise':
      return { isOn, hint: 'allowed', notice: 'precise' }
    case 'removed':
      return { isOn, hint: 'off', notice: 'lessPrecise' }
    case 'never-enabled':
      return { isOn, hint: 'pitch', notice: null }
  }
}
