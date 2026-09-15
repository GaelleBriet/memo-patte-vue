// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { NO_PLUS, plusStatusFrom } from '../plus-status'
import { customerInfo, entitlement, LIFETIME } from './billing-fixture'

describe('plusStatusFrom', () => {
  it('renvoie « aucun » sans droit plus actif', () => {
    expect(plusStatusFrom(customerInfo(null))).toEqual(NO_PLUS)
  })

  it('renvoie « aucun » quand le droit plus a expiré', () => {
    const expired = entitlement({ isActive: false, expirationDate: '2026-08-01T10:00:00Z' })

    expect(plusStatusFrom(customerInfo(null, expired))).toEqual(NO_PLUS)
  })

  it('reconnaît l’abonnement annuel et garde sa date d’expiration', () => {
    expect(plusStatusFrom(customerInfo(entitlement()))).toEqual({
      plan: 'annual',
      expiresAt: '2027-09-01T10:00:00Z',
    })
  })

  it('reconnaît l’abonnement mensuel par son base plan', () => {
    const monthly = entitlement({
      productPlanIdentifier: 'monthly',
      expirationDate: '2026-10-01T10:00:00Z',
    })

    expect(plusStatusFrom(customerInfo(monthly))).toEqual({
      plan: 'monthly',
      expiresAt: '2026-10-01T10:00:00Z',
    })
  })

  it('lit le base plan dans l’identifiant produit quand il n’est pas fourni à part', () => {
    const monthly = entitlement({
      productIdentifier: 'memopatte_plus:monthly',
      productPlanIdentifier: null,
    })

    expect(plusStatusFrom(customerInfo(monthly)).plan).toBe('monthly')
  })

  it('déduit la périodicité de la durée quand le base plan est inconnu', () => {
    const shortPeriod = entitlement({
      productIdentifier: 'memopatte_plus',
      productPlanIdentifier: null,
      latestPurchaseDate: '2026-09-01T10:00:00Z',
      expirationDate: '2026-10-01T10:00:00Z',
    })
    const longPeriod = entitlement({
      productIdentifier: 'memopatte_plus',
      productPlanIdentifier: null,
    })

    expect(plusStatusFrom(customerInfo(shortPeriod)).plan).toBe('monthly')
    expect(plusStatusFrom(customerInfo(longPeriod)).plan).toBe('annual')
  })

  it('reconnaît l’achat à vie, sans date d’expiration', () => {
    expect(plusStatusFrom(customerInfo(entitlement(LIFETIME)))).toEqual({
      plan: 'lifetime',
      expiresAt: null,
    })
  })

  it('garde l’accès pendant la période de grâce', () => {
    const grace = entitlement({ billingIssueDetectedAt: '2026-09-14T10:00:00Z' })

    expect(plusStatusFrom(customerInfo(grace)).plan).toBe('annual')
  })
})
