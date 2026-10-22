// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { validatePasswordChange } from '../logic/password-change-form'

describe('validatePasswordChange', () => {
  it('rend les deux mots de passe tels quels', () => {
    expect(validatePasswordChange({ current: 'ancien', next: 'nouveau-secret' })).toEqual({
      success: true,
      data: { current: 'ancien', next: 'nouveau-secret' },
    })
  })

  it('réclame l’actuel, sans exiger de longueur : il a pu être choisi avant la règle', () => {
    expect(validatePasswordChange({ current: '', next: 'nouveau-secret' })).toEqual({
      success: false,
      errors: { current: 'auth.form.errors.passwordRequired' },
    })
  })

  it('exige 8 caractères au nouveau, comme à l’inscription', () => {
    expect(validatePasswordChange({ current: 'ancien', next: 'court' })).toEqual({
      success: false,
      errors: { next: 'auth.form.errors.passwordTooShort' },
    })
    expect(validatePasswordChange({ current: 'ancien', next: '' })).toEqual({
      success: false,
      errors: { next: 'auth.form.errors.passwordRequired' },
    })
  })
})
