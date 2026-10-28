// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { plusAccessFrom, type RevenuecatSubscriber } from '../plus-access'
import { PLUS_ACCESS_RULES } from '../plus-access-rules'

const NOW = Date.parse('2027-03-10T12:00:00Z')

function annualOfSophie(overrides: Record<string, unknown> = {}): RevenuecatSubscriber {
  return {
    entitlements: {
      plus: {
        expires_date: '2028-03-03T09:00:00Z',
        grace_period_expires_date: null,
        product_identifier: 'memopatte_plus:annual',
        purchase_date: '2027-03-03T09:00:00Z',
      },
    },
    subscriptions: {
      'memopatte_plus:annual': {
        expires_date: '2028-03-03T09:00:00Z',
        grace_period_expires_date: null,
        purchase_date: '2027-03-03T09:00:00Z',
        refunded_at: null,
        auto_resume_date: null,
        is_sandbox: false,
        ...overrides,
      },
    },
    non_subscriptions: {},
  }
}

function lifetimeOfSophie(refundedAt: string | null = null): RevenuecatSubscriber {
  return {
    entitlements: {
      plus: {
        expires_date: null,
        grace_period_expires_date: null,
        product_identifier: 'memopatte_plus_lifetime',
        purchase_date: '2026-11-10T08:00:00Z',
      },
    },
    subscriptions: {},
    non_subscriptions: {
      memopatte_plus_lifetime: [
        { id: 'a1', purchase_date: '2026-11-10T08:00:00Z', refunded_at: refundedAt },
      ],
    },
  }
}

describe('plusAccessFrom', () => {
  it('ne rend rien pour un client sans droit Plus', () => {
    expect(plusAccessFrom({ entitlements: {} }, NOW)).toBeNull()
    expect(plusAccessFrom({}, NOW)).toBeNull()
  })

  it('un abonnement annuel en cours donne Plus jusqu’à sa fin', () => {
    expect(plusAccessFrom(annualOfSophie(), NOW)).toEqual({
      active: true,
      productType: 'annual',
      expiresAt: '2028-03-03T09:00:00.000Z',
    })
  })

  it('un abonnement mensuel se reconnaît à son plan de base', () => {
    const monthly: RevenuecatSubscriber = {
      entitlements: {
        plus: {
          expires_date: '2027-04-03T09:00:00Z',
          product_identifier: 'memopatte_plus:monthly',
          purchase_date: '2027-03-03T09:00:00Z',
        },
      },
    }

    expect(plusAccessFrom(monthly, NOW)?.productType).toBe('monthly')
  })

  it.each([
    ['31 jours', '2027-04-03T09:00:00Z', 'monthly'],
    ['un an', '2028-03-03T09:00:00Z', 'annual'],
  ])('sans plan de base lisible, une période de %s donne %s', (_, expires, productType) => {
    const subscriber: RevenuecatSubscriber = {
      entitlements: {
        plus: {
          expires_date: expires,
          product_identifier: 'memopatte_plus',
          purchase_date: '2027-03-03T09:00:00Z',
        },
      },
    }

    expect(plusAccessFrom(subscriber, NOW)?.productType).toBe(productType)
  })

  it('un achat à vie donne Plus sans date de fin', () => {
    expect(plusAccessFrom(lifetimeOfSophie(), NOW)).toEqual({
      active: true,
      productType: 'lifetime',
      expiresAt: null,
    })
  })

  it('un achat en bac à sable compte comme un vrai', () => {
    const sandbox = annualOfSophie({ is_sandbox: true })

    expect(plusAccessFrom(sandbox, NOW)?.active).toBe(true)
  })

  it('un abonnement terminé garde sa date de fin et n’est plus actif', () => {
    const ended = annualOfSophie()
    ended.entitlements!.plus!.expires_date = '2027-03-03T09:00:00Z'

    expect(plusAccessFrom(ended, NOW)).toEqual({
      active: false,
      productType: 'annual',
      expiresAt: '2027-03-03T09:00:00.000Z',
    })
  })

  it('le délai de paiement prolonge l’accès jusqu’à sa fin', () => {
    const billingIssue = annualOfSophie()
    billingIssue.entitlements!.plus!.expires_date = '2027-03-03T09:00:00Z'
    billingIssue.entitlements!.plus!.grace_period_expires_date = '2027-03-19T09:00:00Z'

    expect(plusAccessFrom(billingIssue, NOW)).toEqual({
      active: true,
      productType: 'annual',
      expiresAt: '2027-03-19T09:00:00.000Z',
    })
  })

  it('le délai de paiement noté sur l’achat compte aussi', () => {
    const billingIssue = annualOfSophie({ grace_period_expires_date: '2027-03-19T09:00:00Z' })
    billingIssue.entitlements!.plus!.expires_date = '2027-03-03T09:00:00Z'

    expect(plusAccessFrom(billingIssue, NOW)?.expiresAt).toBe('2027-03-19T09:00:00.000Z')
  })

  describe('remboursement', () => {
    it('coupe l’accès d’un abonnement à la date du remboursement', () => {
      const refunded = annualOfSophie({ refunded_at: '2027-03-05T10:00:00Z' })

      expect(plusAccessFrom(refunded, NOW)).toEqual({
        active: false,
        productType: 'annual',
        expiresAt: '2027-03-05T10:00:00.000Z',
      })
    })

    it('coupe l’accès à vie à la date du remboursement', () => {
      expect(plusAccessFrom(lifetimeOfSophie('2026-11-11T08:00:00Z'), NOW)).toEqual({
        active: false,
        productType: 'lifetime',
        expiresAt: '2026-11-11T08:00:00.000Z',
      })
    })

    it('avec l’autre règle, l’abonnement remboursé court jusqu’à la fin de la période payée', () => {
      const refunded = annualOfSophie({ refunded_at: '2027-03-05T10:00:00Z' })

      expect(
        plusAccessFrom(refunded, NOW, { ...PLUS_ACCESS_RULES, refundEndsAccess: false }),
      ).toEqual({ active: true, productType: 'annual', expiresAt: '2028-03-03T09:00:00.000Z' })
    })
  })

  describe('pause d’un abonnement mensuel', () => {
    function pausedMonthly(): RevenuecatSubscriber {
      return {
        entitlements: {
          plus: {
            expires_date: '2027-01-03T09:00:00Z',
            product_identifier: 'memopatte_plus:monthly',
            purchase_date: '2026-12-03T09:00:00Z',
          },
        },
        subscriptions: {
          'memopatte_plus:monthly': {
            expires_date: '2027-01-03T09:00:00Z',
            purchase_date: '2026-12-03T09:00:00Z',
            auto_resume_date: '2027-04-03T09:00:00Z',
          },
        },
      }
    }

    it('met la sauvegarde en pause jusqu’à la reprise', () => {
      expect(plusAccessFrom(pausedMonthly(), NOW)).toEqual({
        active: false,
        productType: 'monthly',
        expiresAt: '2027-01-03T09:00:00.000Z',
      })
    })

    it('avec l’autre règle, la sauvegarde continue jusqu’à la reprise', () => {
      expect(
        plusAccessFrom(pausedMonthly(), NOW, { ...PLUS_ACCESS_RULES, pauseSuspendsBackup: false }),
      ).toEqual({ active: true, productType: 'monthly', expiresAt: '2027-04-03T09:00:00.000Z' })
    })
  })
})

describe('plusAccessFrom, droit promotionnel', () => {
  function promotional(duration: string, expires: string): RevenuecatSubscriber {
    const product = `rc_promo_plus_${duration}`
    return {
      entitlements: {
        plus: {
          expires_date: expires,
          product_identifier: product,
          purchase_date: '2027-03-03T09:00:00Z',
        },
      },
      subscriptions: {
        [product]: {
          expires_date: expires,
          purchase_date: '2027-03-03T09:00:00Z',
          store: 'promotional',
        },
      },
    }
  }

  it('un mois offert donne Plus jusqu’à sa fin', () => {
    expect(plusAccessFrom(promotional('monthly', '2027-04-03T09:00:00Z'), NOW)).toEqual({
      active: true,
      productType: 'monthly',
      expiresAt: '2027-04-03T09:00:00.000Z',
    })
  })

  it('un droit offert « à vie », que RevenueCat date de deux siècles, donne Plus', () => {
    const access = plusAccessFrom(promotional('lifetime', '2227-03-03T09:00:00Z'), NOW)

    expect(access).toMatchObject({ active: true, expiresAt: '2227-03-03T09:00:00.000Z' })
  })

  it('un droit offert échu ne donne plus Plus', () => {
    expect(plusAccessFrom(promotional('monthly', '2027-03-08T09:00:00Z'), NOW)?.active).toBe(false)
  })
})
