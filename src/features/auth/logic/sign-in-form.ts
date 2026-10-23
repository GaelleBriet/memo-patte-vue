import { z } from 'zod'

import { fieldErrorsOf, type FieldErrorKeys } from '@/shared/form/field-errors'

import { PASSWORDS_DIFFER_KEY, withPasswordConfirmation } from './new-password-confirmation'

export type SignInMode = 'sign-in' | 'sign-up'

export interface SignInCredentials {
  email: string
  password: string
}

export interface SignInFormValues extends SignInCredentials {
  confirmation: string
}

export const MIN_PASSWORD_LENGTH = 8

export type SignInFormErrors = Partial<Record<keyof SignInFormValues, string>>

export type SignInFormResult =
  { success: true; data: SignInCredentials } | { success: false; errors: SignInFormErrors }

export const emailSchema = z.string().trim().min(1).pipe(z.email())

export const newPasswordSchema = z.string().min(MIN_PASSWORD_LENGTH)

export const EMAIL_ERROR_KEYS: FieldErrorKeys = {
  key: 'auth.form.errors.emailInvalid',
  byCode: { too_small: 'auth.form.errors.emailRequired' },
}

export function passwordErrorKeys(password: string): FieldErrorKeys {
  return {
    key:
      password === '' ? 'auth.form.errors.passwordRequired' : 'auth.form.errors.passwordTooShort',
  }
}

const signInSchema = z.object({ email: emailSchema, password: z.string().min(1) })

const signUpSchema = withPasswordConfirmation(
  z.object({ email: emailSchema, password: newPasswordSchema, confirmation: z.string() }),
  'password',
)

function errorKeysFor(values: SignInFormValues): Record<keyof SignInFormValues, FieldErrorKeys> {
  return {
    email: EMAIL_ERROR_KEYS,
    password: passwordErrorKeys(values.password),
    confirmation: { key: PASSWORDS_DIFFER_KEY },
  }
}

export function emptySignInFormValues(): SignInFormValues {
  return { email: '', password: '', confirmation: '' }
}

export function validateSignInForm(values: SignInFormValues, mode: SignInMode): SignInFormResult {
  const result = (mode === 'sign-up' ? signUpSchema : signInSchema).safeParse(values)

  if (result.success) {
    return { success: true, data: { email: result.data.email, password: result.data.password } }
  }

  return { success: false, errors: fieldErrorsOf(result.error.issues, errorKeysFor(values)) }
}
