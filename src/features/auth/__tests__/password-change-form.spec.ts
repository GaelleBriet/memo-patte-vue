// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { validatePasswordChange } from '../logic/password-change-form'

describe('validatePasswordChange', () => {
  it('rend l’actuel et le nouveau tels quels, sans la confirmation', () => {
    expect(
      validatePasswordChange({
        current: 'ancien',
        next: 'nouveau-secret',
        confirmation: 'nouveau-secret',
      }),
    ).toEqual({
      success: true,
      data: { current: 'ancien', next: 'nouveau-secret' },
    })
  })

  it('réclame l’actuel, sans exiger de longueur : il a pu être choisi avant la règle', () => {
    expect(
      validatePasswordChange({
        current: '',
        next: 'nouveau-secret',
        confirmation: 'nouveau-secret',
      }),
    ).toEqual({
      success: false,
      errors: { current: 'auth.form.errors.passwordRequired' },
    })
  })

  it('exige 8 caractères au nouveau, comme à l’inscription', () => {
    expect(
      validatePasswordChange({ current: 'ancien', next: 'court', confirmation: 'court' }),
    ).toEqual({
      success: false,
      errors: { next: 'auth.form.errors.passwordTooShort' },
    })
    expect(validatePasswordChange({ current: 'ancien', next: '', confirmation: '' })).toEqual({
      success: false,
      errors: { next: 'auth.form.errors.passwordRequired' },
    })
  })

  it('refuse une confirmation qui diffère du nouveau, sous la confirmation', () => {
    for (const confirmation of ['autre-secret', 'nouveau-secret ', 'NOUVEAU-SECRET', '']) {
      expect(
        validatePasswordChange({ current: 'ancien', next: 'nouveau-secret', confirmation }),
      ).toEqual({ success: false, errors: { confirmation: 'auth.password.mismatch' } })
    }
  })

  it('signale à la fois un nouveau trop court et une confirmation qui diffère', () => {
    expect(
      validatePasswordChange({ current: 'ancien', next: 'court', confirmation: 'cour' }),
    ).toEqual({
      success: false,
      errors: { next: 'auth.form.errors.passwordTooShort', confirmation: 'auth.password.mismatch' },
    })
  })
})
