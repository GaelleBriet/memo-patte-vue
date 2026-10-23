import { z } from 'zod'

import { fieldErrorsOf } from '@/shared/form/field-errors'

import { PASSWORDS_DIFFER_KEY, withPasswordConfirmation } from './new-password-confirmation'
import { newPasswordSchema, passwordErrorKeys } from './sign-in-form'

export type PasswordChangeValues = { current: string; next: string; confirmation: string }

export type PasswordChange = { current: string; next: string }

export type PasswordChangeResult =
  | { success: true; data: PasswordChange }
  | { success: false; errors: Partial<Record<keyof PasswordChangeValues, string>> }

const schema = withPasswordConfirmation(
  z.object({ current: z.string().min(1), next: newPasswordSchema, confirmation: z.string() }),
  'next',
)

export function validatePasswordChange(values: PasswordChangeValues): PasswordChangeResult {
  const result = schema.safeParse(values)
  if (result.success) {
    return { success: true, data: { current: result.data.current, next: result.data.next } }
  }
  return {
    success: false,
    errors: fieldErrorsOf(result.error.issues, {
      current: { key: 'auth.form.errors.passwordRequired' },
      next: passwordErrorKeys(values.next),
      confirmation: { key: PASSWORDS_DIFFER_KEY },
    }),
  }
}
