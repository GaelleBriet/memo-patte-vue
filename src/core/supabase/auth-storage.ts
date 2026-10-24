import { errorSummary } from '@/shared/utils/error-summary'

export const AUTH_STORAGE_KEY = 'memopatte.auth.session'

function pendingPkceFlowIds(): string[] {
  try {
    const index: unknown = JSON.parse(
      localStorage.getItem(`${AUTH_STORAGE_KEY}-flows-code-verifier`) ?? '[]',
    )
    return Array.isArray(index) ? index.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function forgetStoredSession(): void {
  const keys = [
    ...pendingPkceFlowIds().map((id) => `${AUTH_STORAGE_KEY}-flow-${id}-code-verifier`),
    `${AUTH_STORAGE_KEY}-flows-code-verifier`,
    `${AUTH_STORAGE_KEY}-code-verifier`,
    `${AUTH_STORAGE_KEY}-user`,
    AUTH_STORAGE_KEY,
  ]
  for (const key of keys) {
    try {
      localStorage.removeItem(key)
    } catch (cause) {
      console.warn('Session non effacée de l’appareil :', errorSummary(cause))
    }
  }
}
