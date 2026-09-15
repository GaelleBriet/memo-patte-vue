import { App, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

type Handler = () => void

const handlers: Array<{ handler: Handler }> = []
let detach: (() => void) | null = null

// Tout écouteur backButton coupe le retour natif de Capacitor : il faut le rejouer quand rien n'est à fermer.
function onBack({ canGoBack }: BackButtonListenerEvent): void {
  const top = handlers.at(-1)
  if (top) top.handler()
  else if (canGoBack) window.history.back()
  else void App.minimizeApp().catch(() => {})
}

/** Branche le bouton retour Android (sans effet dans le navigateur) ; renvoie la désinstallation. */
export function installBackButton(): () => void {
  if (!Capacitor.isNativePlatform() || detach) return () => {}

  const handle = App.addListener('backButton', onBack).catch(() => null)
  detach = () => void handle.then((listener) => listener?.remove())

  return () => {
    detach?.()
    detach = null
  }
}

/** Confie le prochain retour à `handler`, avant tout gestionnaire inscrit plus tôt ; renvoie la désinscription. */
export function onBackButton(handler: Handler): () => void {
  const entry = { handler }
  handlers.push(entry)

  return () => {
    const index = handlers.indexOf(entry)
    if (index !== -1) handlers.splice(index, 1)
  }
}
