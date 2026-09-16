// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { emptySignInFormValues, MIN_PASSWORD_LENGTH, validateSignInForm } from '../sign-in-form'

describe('validateSignInForm', () => {
  it('rend l’adresse nettoyée et le mot de passe tel quel', () => {
    const result = validateSignInForm(
      { email: '  sophie.martin@example.com ', password: 'mot de passe' },
      'sign-in',
    )

    expect(result).toEqual({
      success: true,
      data: { email: 'sophie.martin@example.com', password: 'mot de passe' },
    })
  })

  it('réclame une adresse quand le champ est vide', () => {
    const result = validateSignInForm({ email: '   ', password: 'motdepasse' }, 'sign-in')

    expect(result).toEqual({
      success: false,
      errors: { email: 'auth.form.errors.emailRequired' },
    })
  })

  it('signale une adresse mal formée', () => {
    const result = validateSignInForm({ email: 'sophie.martin', password: 'motdepasse' }, 'sign-in')

    expect(result).toEqual({
      success: false,
      errors: { email: 'auth.form.errors.emailInvalid' },
    })
  })

  it('réclame un mot de passe quand le champ est vide', () => {
    const result = validateSignInForm({ email: 'sophie@example.com', password: '' }, 'sign-in')

    expect(result).toEqual({
      success: false,
      errors: { password: 'auth.form.errors.passwordRequired' },
    })
  })

  it('accepte un mot de passe court à la connexion, pour ne pas bloquer un compte plus ancien', () => {
    const result = validateSignInForm({ email: 'sophie@example.com', password: 'court' }, 'sign-in')

    expect(result.success).toBe(true)
  })

  it('exige la longueur minimale à l’inscription', () => {
    const result = validateSignInForm({ email: 'sophie@example.com', password: 'court' }, 'sign-up')

    expect(result).toEqual({
      success: false,
      errors: { password: 'auth.form.errors.passwordTooShort' },
    })
  })

  it('accepte à l’inscription un mot de passe de la longueur minimale', () => {
    const result = validateSignInForm(
      { email: 'sophie@example.com', password: 'x'.repeat(MIN_PASSWORD_LENGTH) },
      'sign-up',
    )

    expect(result.success).toBe(true)
  })

  it('rapporte les deux champs en une fois', () => {
    const result = validateSignInForm({ email: '', password: '' }, 'sign-up')

    expect(result).toEqual({
      success: false,
      errors: {
        email: 'auth.form.errors.emailRequired',
        password: 'auth.form.errors.passwordRequired',
      },
    })
  })
})

describe('emptySignInFormValues', () => {
  it('part de deux champs vides', () => {
    expect(emptySignInFormValues()).toEqual({ email: '', password: '' })
  })
})
