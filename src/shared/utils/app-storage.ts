import { errorSummary } from './error-summary'

const APP_KEY_PREFIX = 'memopatte.'

/** Préférences, signaux, consentement, session : tout ce que l'app range dans le `localStorage`. */
export function clearAppStorage(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    for (const key of keys) if (key?.startsWith(APP_KEY_PREFIX)) localStorage.removeItem(key)
  } catch (cause) {
    console.warn('Réglages non effacés :', errorSummary(cause))
  }
}
