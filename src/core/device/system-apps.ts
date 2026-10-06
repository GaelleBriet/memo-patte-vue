import { AppLauncher } from '@capacitor/app-launcher'
import { Device } from '@capacitor/device'

/** `null` hors d'Android, ou quand l'appareil ne répond pas. */
export async function androidVersion(): Promise<string | null> {
  try {
    const info = await Device.getInfo()
    return info.platform === 'android' && info.osVersion ? info.osVersion : null
  } catch {
    return null
  }
}

/** `false` quand aucune app du téléphone ne sait ouvrir ce lien. */
export async function openInExternalApp(url: string): Promise<boolean> {
  try {
    return (await AppLauncher.openUrl({ url })).completed
  } catch {
    return false
  }
}
