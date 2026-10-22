import { z } from 'zod'

import { fieldErrorsOf } from '@/shared/form/field-errors'

import { EMAIL_ERROR_KEYS, emailSchema } from './sign-in-form'

export type EmailChangeValues = { current: string; email: string }

export type EmailChangeResult =
  | { success: true; data: EmailChangeValues }
  | { success: false; errors: Partial<Record<keyof EmailChangeValues, string>> }

const SAME_ADDRESS_KEY = 'settings.account.email.sameAddress'

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

const schema = z.object({ current: z.string().min(1), email: emailSchema })

export function validateEmailChange(
  values: EmailChangeValues,
  accountEmail: string | null = null,
): EmailChangeResult {
  const result = schema.safeParse(values)
  if (result.success) {
    if (accountEmail !== null && sameAddress(result.data.email, accountEmail)) {
      return { success: false, errors: { email: SAME_ADDRESS_KEY } }
    }
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: fieldErrorsOf(result.error.issues, {
      current: { key: 'auth.form.errors.passwordRequired' },
      email: EMAIL_ERROR_KEYS,
    }),
  }
}
