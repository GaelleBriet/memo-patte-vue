// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { accountDeletionPurchaseNote } from '../logic/account-deletion-purchase-note'

const SUBSCRIPTION_NOTE = {
  summary: 'settings.account.delete.subscription',
  finalConfirm: 'settings.account.delete.finalConfirm.subscription',
}

describe('accountDeletionPurchaseNote', () => {
  it.each([
    ['sans Plus', { plan: 'none', expiresAt: null }],
    ['un abonnement mensuel', { plan: 'monthly', expiresAt: '2026-11-29T09:00:00Z' }],
    ['un abonnement annuel', { plan: 'annual', expiresAt: '2027-10-29T09:00:00Z' }],
  ] as const)('garde la phrase sur l’abonnement Google Play %s', (_, status) => {
    expect(accountDeletionPurchaseNote(status)).toEqual(SUBSCRIPTION_NOTE)
  })

  it('dit qu’un achat à vie n’est pas remboursé', () => {
    expect(accountDeletionPurchaseNote({ plan: 'lifetime', expiresAt: null })).toEqual({
      summary: 'settings.account.delete.lifetime',
      finalConfirm: 'settings.account.delete.lifetime',
    })
  })

  it('ne dit rien d’un droit offert', () => {
    expect(
      accountDeletionPurchaseNote({
        plan: 'monthly',
        expiresAt: '2026-11-29T09:00:00Z',
        offered: true,
      }),
    ).toBeNull()
  })
})
