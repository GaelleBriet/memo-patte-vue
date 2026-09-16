import { z } from 'zod'

export type SignInMode = 'sign-in' | 'sign-up'

export interface SignInFormValues {
  email: string
  password: string
}

export const MIN_PASSWORD_LENGTH = 8

const ERROR_KEYS = {
  emailRequired: 'auth.form.errors.emailRequired',
  emailInvalid: 'auth.form.errors.emailInvalid',
  passwordRequired: 'auth.form.errors.passwordRequired',
  passwordTooShort: 'auth.form.errors.passwordTooShort',
} as const

export type SignInFormErrors = Partial<Record<'email' | 'password', string>>

export type SignInFormResult =
  { success: true; data: SignInFormValues } | { success: false; errors: SignInFormErrors }

// La longueur minimale ne s'applique qu'à l'inscription : un compte plus ancien peut
// avoir un mot de passe plus court, et c'est Supabase qui le vérifie à la connexion.
function schemaFor(mode: SignInMode) {
  return z.object({
    email: z.string().trim().min(1).pipe(z.email()),
    password: z.string().min(mode === 'sign-up' ? MIN_PASSWORD_LENGTH : 1),
  })
}

export function emptySignInFormValues(): SignInFormValues {
  return { email: '', password: '' }
}

export function validateSignInForm(values: SignInFormValues, mode: SignInMode): SignInFormResult {
  const result = schemaFor(mode).safeParse(values)

  if (result.success) return { success: true, data: result.data }

  const errors: SignInFormErrors = {}

  for (const issue of result.error.issues) {
    const field = String(issue.path[0])

    if (field === 'email') {
      errors.email ??=
        issue.code === 'too_small' ? ERROR_KEYS.emailRequired : ERROR_KEYS.emailInvalid
    } else if (field === 'password') {
      errors.password ??=
        values.password === '' ? ERROR_KEYS.passwordRequired : ERROR_KEYS.passwordTooShort
    }
  }

  return { success: false, errors }
}
