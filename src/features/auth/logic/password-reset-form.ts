import { z } from 'zod'

import { fieldErrorsOf } from '@/shared/form/field-errors'

import { PASSWORDS_DIFFER_KEY, withPasswordConfirmation } from './new-password-confirmation'
import { EMAIL_ERROR_KEYS, emailSchema, newPasswordSchema, passwordErrorKeys } from './sign-in-form'

export type ResetEmailValues = { email: string }
export type NewPasswordValues = { password: string; confirmation: string }

export type ResetEmailResult =
  | { success: true; data: ResetEmailValues }
  | { success: false; errors: Partial<Record<'email', string>> }

export type NewPasswordResult =
  | { success: true; data: { password: string } }
  | { success: false; errors: Partial<Record<keyof NewPasswordValues, string>> }

export function validateResetEmail(values: ResetEmailValues): ResetEmailResult {
  const result = z.object({ email: emailSchema }).safeParse(values)
  if (result.success) return { success: true, data: result.data }
  return { success: false, errors: fieldErrorsOf(result.error.issues, { email: EMAIL_ERROR_KEYS }) }
}

const newPasswordFormSchema = withPasswordConfirmation(
  z.object({ password: newPasswordSchema, confirmation: z.string() }),
  'password',
)

export function validateNewPassword(values: NewPasswordValues): NewPasswordResult {
  const result = newPasswordFormSchema.safeParse(values)
  if (result.success) return { success: true, data: { password: result.data.password } }
  return {
    success: false,
    errors: fieldErrorsOf(result.error.issues, {
      password: passwordErrorKeys(values.password),
      confirmation: { key: PASSWORDS_DIFFER_KEY },
    }),
  }
}
