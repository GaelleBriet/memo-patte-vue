// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { keepsPendingCheckout, keepsPendingRestore } from '../logic/pending-checkout'

describe('keepsPendingCheckout', () => {
  it('ne garde l’offre que sur l’écran Plus, l’étape 1 et la connexion', () => {
    expect(keepsPendingCheckout('plus')).toBe(true)
    expect(keepsPendingCheckout('plus-account')).toBe(true)
    expect(keepsPendingCheckout('sign-in')).toBe(true)
    expect(keepsPendingCheckout('home')).toBe(false)
    expect(keepsPendingCheckout('settings-plus')).toBe(false)
    expect(keepsPendingCheckout(undefined)).toBe(false)
  })
})

describe('keepsPendingRestore', () => {
  it('ne garde la demande que sur l’écran Plus, Paramètres › Plus et la connexion', () => {
    expect(keepsPendingRestore('plus')).toBe(true)
    expect(keepsPendingRestore('settings-plus')).toBe(true)
    expect(keepsPendingRestore('sign-in')).toBe(true)
    expect(keepsPendingRestore('plus-account')).toBe(false)
    expect(keepsPendingRestore('home')).toBe(false)
  })
})
