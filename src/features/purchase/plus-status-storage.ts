import { z } from 'zod'

import { NO_PLUS, type PlusStatus } from './plus-status'

export const PLUS_STATUS_STORAGE_KEY = 'memopatte.plus.status'

const storedPlusStatusSchema = z.object({
  plan: z.enum(['none', 'monthly', 'annual', 'lifetime']),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
})

export function readStoredPlusStatus(): PlusStatus {
  try {
    const raw = localStorage.getItem(PLUS_STATUS_STORAGE_KEY)
    if (raw === null) return NO_PLUS
    const parsed = storedPlusStatusSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : NO_PLUS
  } catch {
    return NO_PLUS
  }
}

export function writeStoredPlusStatus(status: PlusStatus): void {
  try {
    localStorage.setItem(PLUS_STATUS_STORAGE_KEY, JSON.stringify(status))
  } catch (cause) {
    console.warn('Statut Plus non enregistré :', cause)
  }
}
