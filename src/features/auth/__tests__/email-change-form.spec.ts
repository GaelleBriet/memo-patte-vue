// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { validateEmailChange } from '../logic/email-change-form'

describe('validateEmailChange', () => {
  it('rend le mot de passe tel quel et la nouvelle adresse nettoyée', () => {
    expect(validateEmailChange({ current: 'secret', email: ' sophie2@exemple.fr ' })).toEqual({
      success: true,
      data: { current: 'secret', email: 'sophie2@exemple.fr' },
    })
  })

  it('réclame le mot de passe et une adresse valide, avec les messages de la connexion', () => {
    expect(validateEmailChange({ current: '', email: 'sophie2' })).toEqual({
      success: false,
      errors: {
        current: 'auth.form.errors.passwordRequired',
        email: 'auth.form.errors.emailInvalid',
      },
    })
    expect(validateEmailChange({ current: 'secret', email: '' })).toEqual({
      success: false,
      errors: { email: 'auth.form.errors.emailRequired' },
    })
  })

  it('refuse l’adresse du compte, sans tenir compte des majuscules', () => {
    expect(
      validateEmailChange({ current: 'secret', email: ' Sophie@Exemple.fr ' }, 'sophie@exemple.fr'),
    ).toEqual({
      success: false,
      errors: { email: 'settings.account.email.sameAddress' },
    })
  })

  it('accepte une autre adresse que celle du compte', () => {
    expect(
      validateEmailChange({ current: 'secret', email: 'sophie2@exemple.fr' }, 'sophie@exemple.fr')
        .success,
    ).toBe(true)
  })
})
