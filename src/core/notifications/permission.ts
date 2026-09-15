import { Capacitor, type PermissionState } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { AndroidSettings, NativeSettings } from 'capacitor-native-settings'

import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { requestPermission } from './notifications.service'
import { remindersGranted } from './reminders-channel'

/** `disabled` : l'écran d'explication a eu sa réponse, ou le système a coupé les notifications ou le canal des rappels. */
export type NotificationPermissionStatus = 'granted' | 'disabled' | 'unasked' | 'unavailable'

type Listener = () => void

// Propre à l'appareil : le stockage du WebView est exclu de l'Auto Backup et de la synchro.
const PRIMING_ANSWERED_KEY = 'memopatte.notifications.primingAnswered'

const grantedListeners = new Set<Listener>()
let lastGranted: boolean | null = null
// Incrémenté à chaque réponse de la popup : une lecture partie avant ne fait plus foi.
let requestGeneration = 0
let detachResume: (() => void) | null = null

function isPrimingAnswered(): boolean {
  try {
    return localStorage.getItem(PRIMING_ANSWERED_KEY) === 'true'
  } catch {
    return false
  }
}

function markPrimingAnswered(): void {
  try {
    localStorage.setItem(PRIMING_ANSWERED_KEY, 'true')
  } catch {
    // Sans stockage, l'écran pourra réapparaître : rien ne bloque la saisie.
  }
}

function recordGranted(granted: boolean): void {
  const wasGranted = lastGranted
  lastGranted = granted
  if (granted && wasGranted === false) {
    for (const listener of grantedListeners) listener()
  }
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const startedAt = requestGeneration
  let display: PermissionState
  try {
    ;({ display } = await LocalNotifications.checkPermissions())
  } catch {
    return 'unavailable'
  }

  const granted = await remindersGranted(display)

  if (startedAt === requestGeneration) recordGranted(granted)
  if (granted) return 'granted'
  if (display === 'granted' || display === 'denied' || isPrimingAnswered()) return 'disabled'
  return 'unasked'
}

/** Vrai tant que la permission n'est pas accordée et que l'écran d'explication n'a jamais eu de réponse. */
export async function shouldShowPriming(): Promise<boolean> {
  return (await getNotificationPermissionStatus()) === 'unasked'
}

/** Déclenche la popup système ; l'écran d'explication ne sera plus jamais proposé. */
export async function requestAfterPriming(): Promise<boolean> {
  markPrimingAnswered()
  lastGranted ??= false

  let granted: boolean
  try {
    granted = await requestPermission()
  } catch {
    granted = false
  }

  requestGeneration += 1
  recordGranted(granted)
  return granted
}

export function postponePriming(): void {
  markPrimingAnswered()
}

/**
 * Appelle `listener` chaque fois que la permission passe à « accordée » : réponse à la popup,
 * ou activation dans les réglages constatée au retour au premier plan. Renvoie la désinscription.
 */
export function onNotificationPermissionGranted(listener: Listener): () => void {
  grantedListeners.add(listener)
  if (!detachResume) {
    detachResume = onAppResume(() => void getNotificationPermissionStatus())
    void getNotificationPermissionStatus()
  }

  return () => {
    grantedListeners.delete(listener)
    if (grantedListeners.size === 0 && detachResume) {
      detachResume()
      detachResume = null
    }
  }
}

/** Ouvre les réglages de notifications de l'app ; sans effet dans le navigateur. */
export async function openNotificationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    await NativeSettings.openAndroid({ option: AndroidSettings.AppNotification })
  } catch {
    // Écran de notifications par app absent avant Android 8 : la fiche de l'app y mène.
    await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails }).catch(() => {})
  }
}
