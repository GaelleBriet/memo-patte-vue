import type { z } from 'zod'

export const PASSWORDS_DIFFER_KEY = 'auth.password.mismatch'

export function isPasswordConfirmed(password: string, confirmation: string): boolean {
  return password === confirmation
}

/** Ajoute au schéma la règle « confirmation identique au mot de passe », signalée sur `confirmation`. */
export function withPasswordConfirmation<
  Field extends string,
  Schema extends z.ZodType<Record<Field | 'confirmation', string>>,
>(schema: Schema, field: Field) {
  return schema.refine((values) => isPasswordConfirmed(values[field], values.confirmation), {
    path: ['confirmation'],
    message: PASSWORDS_DIFFER_KEY,
  })
}
