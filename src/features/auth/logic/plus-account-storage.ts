import { z } from 'zod'

export const PLUS_ACCOUNT_STORAGE_KEY = 'memopatte.auth.plus-account'

const plusAccountSchema = z.object({
  userId: z.uuid(),
})

export type PlusAccount = z.infer<typeof plusAccountSchema>

export function readPlusAccount(): PlusAccount | null {
  try {
    const raw = localStorage.getItem(PLUS_ACCOUNT_STORAGE_KEY)
    if (raw === null) return null
    const parsed = plusAccountSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writePlusAccount(account: PlusAccount): void {
  try {
    localStorage.setItem(PLUS_ACCOUNT_STORAGE_KEY, JSON.stringify(account))
  } catch (cause) {
    console.warn('Compte Plus non enregistré :', cause)
  }
}

export function clearPlusAccount(): void {
  try {
    localStorage.removeItem(PLUS_ACCOUNT_STORAGE_KEY)
  } catch (cause) {
    console.warn('Compte Plus non effacé :', cause)
  }
}
