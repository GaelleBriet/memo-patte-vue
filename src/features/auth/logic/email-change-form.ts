import { z } from 'zod'

import { fieldErrorsOf } from '@/shared/form/field-errors'

import { EMAIL_ERROR_KEYS, emailSchema } from './sign-in-form'

export type EmailChangeValues = { current: string; email: string }

export type EmailChangeResult =
  | { success: true; data: EmailChangeValues }
  | { success: false; errors: Partial<Record<keyof EmailChangeValues, string>> }

const schema = z.object({ current: z.string().min(1), email: emailSchema })

export function validateEmailChange(values: EmailChangeValues): EmailChangeResult {
  const result = schema.safeParse(values)
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    errors: fieldErrorsOf(result.error.issues, {
      current: { key: 'auth.form.errors.passwordRequired' },
      email: EMAIL_ERROR_KEYS,
    }),
  }
}
