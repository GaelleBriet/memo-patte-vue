// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  PASSWORDS_DIFFER_KEY,
  isPasswordConfirmed,
  withPasswordConfirmation,
} from '../logic/new-password-confirmation'

describe('isPasswordConfirmed', () => {
  it('accepte deux saisies identiques', () => {
    expect(isPasswordConfirmed('nouveau-secret', 'nouveau-secret')).toBe(true)
  })

  it.each([
    ['différentes', 'nouveau-secret', 'autre-secret'],
    ['à un espace près, à la fin', 'nouveau-secret', 'nouveau-secret '],
    ['à un espace près, au début', 'nouveau-secret', ' nouveau-secret'],
    ['à la casse près', 'nouveau-secret', 'Nouveau-Secret'],
    ['avec une confirmation vide', 'nouveau-secret', ''],
    ['avec un nouveau mot de passe vide', '', 'nouveau-secret'],
  ])('refuse deux saisies %s', (_, password, confirmation) => {
    expect(isPasswordConfirmed(password, confirmation)).toBe(false)
  })

  it('compare sans normaliser les caractères accentués', () => {
    expect(isPasswordConfirmed('café-secret', 'café-secret')).toBe(false)
  })
})

describe('withPasswordConfirmation', () => {
  const schema = withPasswordConfirmation(
    z.object({ next: z.string().min(1), confirmation: z.string() }),
    'next',
  )

  it('laisse passer deux saisies identiques', () => {
    expect(schema.safeParse({ next: 'secret', confirmation: 'secret' }).success).toBe(true)
  })

  it('signale l’écart sur le champ de confirmation', () => {
    const result = schema.safeParse({ next: 'secret', confirmation: 'secret ' })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['confirmation']])
    expect(result.error?.issues[0]?.message).toBe(PASSWORDS_DIFFER_KEY)
  })
})
