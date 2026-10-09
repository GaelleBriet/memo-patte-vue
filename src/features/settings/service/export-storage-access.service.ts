import { Capacitor, type PermissionState } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'
import { AndroidSettings, NativeSettings } from 'capacitor-native-settings'

/** `refused` : Android peut encore demander ; `blocked` : il ne demandera plus (« Ne plus demander »). */
export type SaveAccess = 'granted' | 'unasked' | 'refused' | 'blocked'

function afterCheck(state: PermissionState): SaveAccess {
  if (state === 'granted') return 'granted'
  if (state === 'denied') return 'blocked'
  return state === 'prompt' ? 'unasked' : 'refused'
}

function afterRequest(state: PermissionState): SaveAccess {
  if (state === 'granted') return 'granted'
  return state === 'denied' ? 'blocked' : 'refused'
}

/** Lit l'accès au dossier Documents sans jamais afficher la demande d'Android. */
export async function checkSaveAccess(): Promise<SaveAccess> {
  if (!Capacitor.isNativePlatform()) return 'granted'
  try {
    const { publicStorage } = await Filesystem.checkPermissions()
    return afterCheck(publicStorage)
  } catch {
    return 'unasked'
  }
}

/** Accordé d'office sur Android 11 et plus ; sur Android 7 à 10, affiche la demande si besoin. */
export async function requestSaveAccess(): Promise<SaveAccess> {
  if (!Capacitor.isNativePlatform()) return 'granted'
  const { publicStorage } = await Filesystem.checkPermissions()
  if (publicStorage === 'granted') return 'granted'
  const answer = await Filesystem.requestPermissions()
  return afterRequest(answer.publicStorage)
}

export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails }).catch(() => {})
}
