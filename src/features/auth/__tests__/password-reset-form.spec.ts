// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { validateNewPassword, validateResetEmail } from '../logic/password-reset-form'
import { MIN_PASSWORD_LENGTH } from '../logic/sign-in-form'

describe('validateResetEmail', () => {
  it('rend l’adresse nettoyée', () => {
    expect(validateResetEmail({ email: '  sophie@exemple.fr ' })).toEqual({
      success: true,
      data: { email: 'sophie@exemple.fr' },
    })
  })

  it('réclame une adresse quand le champ est vide', () => {
    expect(validateResetEmail({ email: ' ' })).toEqual({
      success: false,
      errors: { email: 'auth.form.errors.emailRequired' },
    })
  })

  it('signale une adresse mal formée, comme à la connexion', () => {
    expect(validateResetEmail({ email: 'sophie' })).toEqual({
      success: false,
      errors: { email: 'auth.form.errors.emailInvalid' },
    })
  })
})

describe('validateNewPassword', () => {
  it('accepte un mot de passe d’au moins 8 caractères, tel quel', () => {
    const password = 'a'.repeat(MIN_PASSWORD_LENGTH)

    expect(validateNewPassword({ password, confirmation: password })).toEqual({
      success: true,
      data: { password },
    })
  })

  it('réclame un mot de passe quand le champ est vide', () => {
    expect(validateNewPassword({ password: '', confirmation: '' })).toEqual({
      success: false,
      errors: { password: 'auth.form.errors.passwordRequired' },
    })
  })

  it('refuse un mot de passe trop court, comme à l’inscription', () => {
    const password = 'a'.repeat(MIN_PASSWORD_LENGTH - 1)

    expect(validateNewPassword({ password, confirmation: password })).toEqual({
      success: false,
      errors: { password: 'auth.form.errors.passwordTooShort' },
    })
  })

  it('refuse une confirmation qui diffère, même d’un espace ou d’une majuscule', () => {
    for (const confirmation of ['autre-secret', 'nouveau-secret ', 'Nouveau-secret', '']) {
      expect(validateNewPassword({ password: 'nouveau-secret', confirmation })).toEqual({
        success: false,
        errors: { confirmation: 'auth.password.mismatch' },
      })
    }
  })
})
