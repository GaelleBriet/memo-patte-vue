import { LocalNotifications } from '@capacitor/local-notifications'

/** `removed` : l'accès a déjà été vu accordé sur ce téléphone, puis retiré dans Android. */
export type ExactRemindersStatus = 'precise' | 'never-enabled' | 'removed' | 'unavailable'

// Propre à l'appareil, comme l'autorisation elle-même : ni synchronisé, ni exporté.
const EVER_GRANTED_KEY = 'memopatte.notifications.exactEverGranted'

function isEverGranted(): boolean {
  try {
    return localStorage.getItem(EVER_GRANTED_KEY) === 'true'
  } catch {
    return false
  }
}

function markEverGranted(): void {
  try {
    localStorage.setItem(EVER_GRANTED_KEY, 'true')
  } catch {
    // Sans stockage, un retrait se lira « jamais activé » : rien ne se programme autrement.
  }
}

const SUGGESTED_KEY = 'memopatte.notifications.exactSuggested'

/** La suggestion du formulaire, une seule fois par téléphone (RA-23). */
export function wasExactRemindersSuggested(): boolean {
  try {
    return localStorage.getItem(SUGGESTED_KEY) === 'true'
  } catch {
    return true
  }
}

export function markExactRemindersSuggested(): void {
  try {
    localStorage.setItem(SUGGESTED_KEY, 'true')
  } catch {
    // Sans stockage, la suggestion se lit déjà faite.
  }
}

async function readAccess(): Promise<boolean | null> {
  let granted: boolean
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
    granted = exact_alarm === 'granted'
  } catch {
    return null
  }
  if (granted) markEverGranted()
  return granted
}

/** Ne demande jamais rien. */
export async function canScheduleExact(): Promise<boolean> {
  return (await readAccess()) === true
}

/** Ne demande jamais rien. */
export async function getExactRemindersStatus(): Promise<ExactRemindersStatus> {
  const granted = await readAccess()
  if (granted === null) return 'unavailable'
  if (granted) return 'precise'
  return isEverGranted() ? 'removed' : 'never-enabled'
}

/** Ouvre l'écran Android « Alarmes et rappels », à n'appeler qu'après l'écran d'explication. */
export async function openExactRemindersSettings(): Promise<ExactRemindersStatus> {
  await LocalNotifications.changeExactNotificationSetting().catch(() => undefined)
  return getExactRemindersStatus()
}
