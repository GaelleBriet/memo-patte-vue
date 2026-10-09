import { z } from 'zod'

import { fieldErrorsOf, type FieldErrorKeys } from '@/shared/form/field-errors'

export type SignInMode = 'sign-in' | 'sign-up'

export interface SignInFormValues {
  email: string
  password: string
}

export const MIN_PASSWORD_LENGTH = 8

export type SignInFormErrors = Partial<Record<'email' | 'password', string>>

export type SignInFormResult =
  { success: true; data: SignInFormValues } | { success: false; errors: SignInFormErrors }

function schemaFor(mode: SignInMode) {
  return z.object({
    email: z.string().trim().min(1).pipe(z.email()),
    password: z.string().min(mode === 'sign-up' ? MIN_PASSWORD_LENGTH : 1),
  })
}

function errorKeysFor(values: SignInFormValues): Record<keyof SignInFormValues, FieldErrorKeys> {
  return {
    email: {
      key: 'auth.form.errors.emailInvalid',
      byCode: { too_small: 'auth.form.errors.emailRequired' },
    },
    password: {
      key:
        values.password === ''
          ? 'auth.form.errors.passwordRequired'
          : 'auth.form.errors.passwordTooShort',
    },
  }
}

export function emptySignInFormValues(): SignInFormValues {
  return { email: '', password: '' }
}

export function validateSignInForm(values: SignInFormValues, mode: SignInMode): SignInFormResult {
  const result = schemaFor(mode).safeParse(values)

  if (result.success) return { success: true, data: result.data }

  return { success: false, errors: fieldErrorsOf(result.error.issues, errorKeysFor(values)) }
}
