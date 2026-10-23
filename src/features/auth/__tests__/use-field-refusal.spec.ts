// @vitest-environment node
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { useFieldRefusal } from '../composables/use-field-refusal'
import { AccountError } from '../logic/account-error'
import { WRONG_PASSWORD_KEY } from '../logic/account-error-message'

function setup(errors: { current?: string; next?: string } = {}) {
  const values = ref({ current: 'ancien', next: 'nouveau' })
  const refusal = useFieldRefusal(
    values,
    computed(() => errors),
  )
  return { values, refusal }
}

describe('useFieldRefusal', () => {
  it('refuse le mot de passe actuel quand il est faux', () => {
    const { refusal } = setup()

    expect(refusal.refuseWrongPassword(new AccountError('invalid-credentials'), 'ancien')).toBe(
      true,
    )

    expect(refusal.fieldError('current')).toBe(WRONG_PASSWORD_KEY)
    expect(refusal.fieldError('next')).toBeNull()
  })

  it('ne retient rien pour une autre erreur', () => {
    const { refusal } = setup()

    expect(refusal.refuseWrongPassword(new AccountError('offline'), 'ancien')).toBe(false)
    expect(refusal.refuseWrongPassword(new Error('boom'), 'ancien')).toBe(false)

    expect(refusal.fieldError('current')).toBeNull()
  })

  it('rend l’erreur de validation quand le champ est vidé ou modifié', () => {
    const { values, refusal } = setup({ current: 'auth.form.errors.passwordRequired' })
    refusal.refuseWrongPassword(new AccountError('invalid-credentials'), 'ancien')

    expect(refusal.fieldError('current')).toBe(WRONG_PASSWORD_KEY)

    values.value = { ...values.value, current: '' }
    expect(refusal.fieldError('current')).toBe('auth.form.errors.passwordRequired')

    values.value = { ...values.value, current: 'autre' }
    expect(refusal.fieldError('current')).toBe('auth.form.errors.passwordRequired')
  })

  it('lève le refus quand la valeur saisie diffère de la valeur soumise', () => {
    const { values, refusal } = setup()
    refusal.refuseWrongPassword(new AccountError('invalid-credentials'), 'faux')

    values.value = { ...values.value, current: 'faux2' }

    expect(refusal.fieldError('current')).toBeNull()
  })

  it('oublie le refus après clear', () => {
    const { refusal } = setup()
    refusal.refuse('next', 'nouveau', 'auth.errors.weakPassword')
    expect(refusal.fieldError('next')).toBe('auth.errors.weakPassword')

    refusal.clear()

    expect(refusal.fieldError('next')).toBeNull()
  })
})
