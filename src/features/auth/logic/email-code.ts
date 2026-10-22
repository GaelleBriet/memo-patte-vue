import { z } from 'zod'

export const CODE_LENGTH = 6

/** Durée de vie du code réglée dans Supabase (« Email OTP Expiration »). */
export const CODE_LIFETIME_MS = 60 * 60 * 1000

/** Délai entre deux envois réglé dans Supabase. */
export const RESEND_DELAY_MS = 60 * 1000

const codeSchema = z.string().regex(new RegExp(`^\\d{${CODE_LENGTH}}$`))

export function codeDigits(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

export function isCompleteCode(code: string): boolean {
  return codeSchema.safeParse(code).success
}

/** Supabase répond pareil à un code faux et à un code expiré : l'heure du dernier envoi tranche. */
export function refusedCodeKey(sentAt: number | null, now: number): string {
  return sentAt !== null && now - sentAt >= CODE_LIFETIME_MS
    ? 'auth.code.errors.expired'
    : 'auth.code.errors.incorrect'
}

export function mustWaitBeforeResend(sentAt: number | null, now: number): boolean {
  return sentAt !== null && now - sentAt < RESEND_DELAY_MS
}
