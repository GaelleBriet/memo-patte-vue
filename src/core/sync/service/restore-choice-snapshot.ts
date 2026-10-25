import { errorSummary } from '@/shared/utils/error-summary'

const STORAGE_KEY = 'memopatte.restore-choice-carnet'

export interface RestoreChoiceSnapshot {
  read(): string | null
  save(fingerprint: string): void
  clear(): void
}

export const restoreChoiceSnapshot: RestoreChoiceSnapshot = {
  read() {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
    } catch {
      return null
    }
  },
  save(fingerprint) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, fingerprint)
    } catch (cause) {
      console.warn('État du carnet au choix de restauration non gardé :', errorSummary(cause))
    }
  },
  clear() {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY)
    } catch (cause) {
      console.warn('État du carnet au choix de restauration non effacé :', errorSummary(cause))
    }
  },
}
