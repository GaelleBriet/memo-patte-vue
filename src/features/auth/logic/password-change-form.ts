import { z } from 'zod'

import { fieldErrorsOf } from '@/shared/form/field-errors'

import { newPasswordSchema, passwordErrorKeys } from './sign-in-form'

export type PasswordChangeValues = { current: string; next: string }

export type PasswordChangeResult =
  | { success: true; data: PasswordChangeValues }
  | { success: false; errors: Partial<Record<keyof PasswordChangeValues, string>> }

const schema = z.object({ current: z.string().min(1), next: newPasswordSchema })

export function validatePasswordChange(values: PasswordChangeValues): PasswordChangeResult {
  const result = schema.safeParse(values)
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    errors: fieldErrorsOf(result.error.issues, {
      current: { key: 'auth.form.errors.passwordRequired' },
      next: passwordErrorKeys(values.next),
    }),
  }
}
