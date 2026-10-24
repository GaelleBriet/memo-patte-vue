import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/** Appelle `listener` à chaque passage de l'app en arrière-plan ; renvoie la désinscription. */
export function onAppPause(listener: () => void): () => void {
  if (Capacitor.isNativePlatform()) {
    const handle = App.addListener('pause', listener).catch(() => null)
    return () => void handle.then((registered) => registered?.remove())
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') listener()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => document.removeEventListener('visibilitychange', onVisibilityChange)
}
