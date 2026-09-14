import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { onScopeDispose } from 'vue'

type Listener = () => void

const listeners = new Set<Listener>()
let detach: (() => void) | null = null

function notify(): void {
  for (const listener of listeners) listener()
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') notify()
}

// En natif, seul `resume` suit l'activité Android ; visibilitychange dépend de la WebView et doublonnerait.
function attach(): () => void {
  if (Capacitor.isNativePlatform()) {
    const handle = App.addListener('resume', notify).catch(() => null)
    return () => void handle.then((listener) => listener?.remove())
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => document.removeEventListener('visibilitychange', onVisibilityChange)
}

/** Appelle `listener` à chaque retour de l'app au premier plan ; renvoie la désinscription. */
export function onAppResume(listener: Listener): () => void {
  listeners.add(listener)
  detach ??= attach()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && detach) {
      detach()
      detach = null
    }
  }
}

/** `onAppResume` lié à la vie du composant appelant. */
export function useAppResume(listener: Listener): void {
  onScopeDispose(onAppResume(listener))
}
