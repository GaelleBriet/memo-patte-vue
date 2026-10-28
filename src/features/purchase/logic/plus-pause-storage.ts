import { z } from 'zod'

import { errorSummary } from '@/shared/utils/error-summary'

export const PLUS_ENDED_AT_STORAGE_KEY = 'memopatte.plus.ended-at'

const endedAtSchema = z.iso.datetime({ offset: true })

export function readPlusEndedAt(): string | null {
  try {
    const parsed = endedAtSchema.safeParse(localStorage.getItem(PLUS_ENDED_AT_STORAGE_KEY))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writePlusEndedAt(endedAt: string): void {
  try {
    localStorage.setItem(PLUS_ENDED_AT_STORAGE_KEY, endedAt)
  } catch (cause) {
    console.warn('Fin de Plus non enregistrée :', errorSummary(cause))
  }
}

export function clearPlusEndedAt(): void {
  try {
    localStorage.removeItem(PLUS_ENDED_AT_STORAGE_KEY)
  } catch (cause) {
    console.warn('Fin de Plus non effacée :', errorSummary(cause))
  }
}
