// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  emptySignInFormValues,
  MIN_PASSWORD_LENGTH,
  validateSignInForm,
} from '../logic/sign-in-form'

describe('validateSignInForm', () => {
  it('rend l’adresse nettoyée et le mot de passe tel quel', () => {
    const result = validateSignInForm(
      { email: '  sophie.martin@example.com ', password: 'mot de passe', confirmation: '' },
      'sign-in',
    )

    expect(result).toEqual({
      success: true,
      data: { email: 'sophie.martin@example.com', password: 'mot de passe' },
    })
  })

  it('réclame une adresse quand le champ est vide', () => {
    const result = validateSignInForm(
      { email: '   ', password: 'motdepasse', confirmation: 'motdepasse' },
      'sign-in',
    )

    expect(result).toEqual({
      success: false,
      errors: { email: 'auth.form.errors.emailRequired' },
    })
  })

  it('signale une adresse mal formée', () => {
    const result = validateSignInForm(
      { email: 'sophie.martin', password: 'motdepasse', confirmation: 'motdepasse' },
      'sign-in',
    )

    expect(result).toEqual({
      success: false,
      errors: { email: 'auth.form.errors.emailInvalid' },
    })
  })

  it('réclame un mot de passe quand le champ est vide', () => {
    const result = validateSignInForm(
      { email: 'sophie@example.com', password: '', confirmation: '' },
      'sign-in',
    )

    expect(result).toEqual({
      success: false,
      errors: { password: 'auth.form.errors.passwordRequired' },
    })
  })

  it('accepte un mot de passe court à la connexion, pour ne pas bloquer un compte plus ancien', () => {
    const result = validateSignInForm(
      { email: 'sophie@example.com', password: 'court', confirmation: 'court' },
      'sign-in',
    )

    expect(result.success).toBe(true)
  })

  it('exige la longueur minimale à l’inscription', () => {
    const result = validateSignInForm(
      { email: 'sophie@example.com', password: 'court', confirmation: 'court' },
      'sign-up',
    )

    expect(result).toEqual({
      success: false,
      errors: { password: 'auth.form.errors.passwordTooShort' },
    })
  })

  it('accepte à l’inscription un mot de passe de la longueur minimale', () => {
    const result = validateSignInForm(
      {
        email: 'sophie@example.com',
        password: 'x'.repeat(MIN_PASSWORD_LENGTH),
        confirmation: 'x'.repeat(MIN_PASSWORD_LENGTH),
      },
      'sign-up',
    )

    expect(result.success).toBe(true)
  })

  it('demande à l’inscription la même saisie deux fois, et ne rend pas la confirmation', () => {
    const values = {
      email: 'sophie@example.com',
      password: 'motdepasse',
      confirmation: 'motdepasse',
    }

    expect(validateSignInForm(values, 'sign-up')).toEqual({
      success: true,
      data: { email: 'sophie@example.com', password: 'motdepasse' },
    })
    expect(validateSignInForm({ ...values, confirmation: 'motdepasse ' }, 'sign-up')).toEqual({
      success: false,
      errors: { confirmation: 'auth.password.mismatch' },
    })
  })

  it('ignore la confirmation à la connexion', () => {
    const result = validateSignInForm(
      { email: 'sophie@example.com', password: 'motdepasse', confirmation: 'autre' },
      'sign-in',
    )

    expect(result).toEqual({
      success: true,
      data: { email: 'sophie@example.com', password: 'motdepasse' },
    })
  })

  it('rapporte les deux champs en une fois', () => {
    const result = validateSignInForm({ email: '', password: '', confirmation: '' }, 'sign-up')

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
  it('part de champs vides', () => {
    expect(emptySignInFormValues()).toEqual({ email: '', password: '', confirmation: '' })
  })
})
