import type { CustomerInfo, PurchasesEntitlementInfo } from '@revenuecat/purchases-capacitor'
import { differenceInDays, parseISO } from 'date-fns'

const PLUS_ENTITLEMENT = 'plus'

const OFFERED_STORE = 'PROMOTIONAL'

export type PlusPlan = 'none' | 'monthly' | 'annual' | 'lifetime'

export type SubscriptionPlan = 'monthly' | 'annual'

export type PlusStatus = {
  plan: PlusPlan
  /** ISO 8601, `null` pour « aucun » et « à vie ». */
  expiresAt: string | null
  /** Droit offert depuis RevenueCat : rien à gérer dans Google Play. */
  offered?: boolean
}

export const NO_PLUS: PlusStatus = { plan: 'none', expiresAt: null }

const LONGEST_MONTHLY_PERIOD_DAYS = 45

/** L'échéance si elle est passée à `now`, sinon `null`. */
export function lapsedAt({ expiresAt }: PlusStatus, now: number): string | null {
  return expiresAt !== null && Date.parse(expiresAt) <= now ? expiresAt : null
}

export function subscriptionOf(status: PlusStatus): SubscriptionPlan | null {
  return status.plan === 'monthly' || status.plan === 'annual' ? status.plan : null
}

function subscriptionPlan(plus: PurchasesEntitlementInfo, expiresAt: string): SubscriptionPlan {
  const basePlan = plus.productPlanIdentifier ?? plus.productIdentifier.split(':')[1]
  if (basePlan === 'monthly' || basePlan === 'annual') return basePlan

  const periodDays = differenceInDays(parseISO(expiresAt), parseISO(plus.latestPurchaseDate))
  return periodDays <= LONGEST_MONTHLY_PERIOD_DAYS ? 'monthly' : 'annual'
}

/** Un droit en période de grâce reste dans `entitlements.active`, donc compte comme actif. */
export function plusStatusFrom(customerInfo: CustomerInfo): PlusStatus {
  const plus = customerInfo.entitlements.active[PLUS_ENTITLEMENT]
  if (!plus) return NO_PLUS
  const status: PlusStatus =
    plus.expirationDate === null
      ? { plan: 'lifetime', expiresAt: null }
      : { plan: subscriptionPlan(plus, plus.expirationDate), expiresAt: plus.expirationDate }
  return plus.store === OFFERED_STORE ? { ...status, offered: true } : status
}
