// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { accountDeletionPurchase } from '../logic/account-deletion-purchase'

const SUBSCRIPTION = {
  note: {
    summary: 'settings.account.delete.subscription',
    finalConfirm: 'settings.account.delete.finalConfirm.subscription',
  },
  managesInGooglePlay: true,
  keepsPurchaseHistory: true,
}

describe('accountDeletionPurchase', () => {
  it.each([
    ['sans Plus', { plan: 'none', expiresAt: null }],
    ['un abonnement mensuel', { plan: 'monthly', expiresAt: '2026-11-29T09:00:00Z' }],
    ['un abonnement annuel', { plan: 'annual', expiresAt: '2027-10-29T09:00:00Z' }],
  ] as const)('garde la phrase et le lien de l’abonnement Google Play %s', (_, status) => {
    expect(accountDeletionPurchase(status)).toEqual(SUBSCRIPTION)
  })

  it('dit qu’un achat à vie n’est pas remboursé, sans lien de gestion', () => {
    expect(accountDeletionPurchase({ plan: 'lifetime', expiresAt: null })).toEqual({
      note: {
        summary: 'settings.account.delete.lifetime',
        finalConfirm: 'settings.account.delete.lifetime',
      },
      managesInGooglePlay: false,
      keepsPurchaseHistory: true,
    })
  })

  it('ne dit rien d’un droit offert', () => {
    expect(
      accountDeletionPurchase({
        plan: 'monthly',
        expiresAt: '2026-11-29T09:00:00Z',
        offered: true,
      }),
    ).toEqual({ note: null, managesInGooglePlay: false, keepsPurchaseHistory: false })
  })

  it('ne parle pas d’abonnement après un droit offert terminé', () => {
    expect(accountDeletionPurchase({ plan: 'none', expiresAt: null }, true)).toEqual({
      note: null,
      managesInGooglePlay: false,
      keepsPurchaseHistory: false,
    })
  })
})
