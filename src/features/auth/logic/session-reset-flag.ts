import { errorSummary } from '@/shared/utils/error-summary'

export const SESSION_RESET_STORAGE_KEY = 'memopatte.auth.session-reset'

export function readSessionReset(): boolean {
  try {
    return localStorage.getItem(SESSION_RESET_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function writeSessionReset(): void {
  try {
    localStorage.setItem(SESSION_RESET_STORAGE_KEY, '1')
  } catch (cause) {
    console.warn('Session illisible non retenue :', errorSummary(cause))
  }
}

export function clearSessionReset(): void {
  try {
    localStorage.removeItem(SESSION_RESET_STORAGE_KEY)
  } catch (cause) {
    console.warn('Session illisible non oubliée :', errorSummary(cause))
  }
}
