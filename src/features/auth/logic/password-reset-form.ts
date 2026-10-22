import { z } from 'zod'

import { fieldErrorsOf } from '@/shared/form/field-errors'

import { EMAIL_ERROR_KEYS, emailSchema, newPasswordSchema, passwordErrorKeys } from './sign-in-form'

export type ResetEmailValues = { email: string }
export type NewPasswordValues = { password: string }

export type ResetEmailResult =
  | { success: true; data: ResetEmailValues }
  | { success: false; errors: Partial<Record<'email', string>> }

export type NewPasswordResult =
  | { success: true; data: NewPasswordValues }
  | { success: false; errors: Partial<Record<'password', string>> }

export function validateResetEmail(values: ResetEmailValues): ResetEmailResult {
  const result = z.object({ email: emailSchema }).safeParse(values)
  if (result.success) return { success: true, data: result.data }
  return { success: false, errors: fieldErrorsOf(result.error.issues, { email: EMAIL_ERROR_KEYS }) }
}

export function validateNewPassword(values: NewPasswordValues): NewPasswordResult {
  const result = z.object({ password: newPasswordSchema }).safeParse(values)
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    errors: fieldErrorsOf(result.error.issues, { password: passwordErrorKeys(values.password) }),
  }
}
