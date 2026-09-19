import type { CustomerInfo, PurchasesEntitlementInfo } from '@revenuecat/purchases-capacitor'
import { differenceInDays, parseISO } from 'date-fns'

export const PLUS_ENTITLEMENT = 'plus'

export type PlusPlan = 'none' | 'monthly' | 'annual' | 'lifetime'

export type SubscriptionPlan = 'monthly' | 'annual'

export type PlusStatus = {
  plan: PlusPlan
  /** ISO 8601, `null` pour « aucun » et « à vie ». */
  expiresAt: string | null
}

export const NO_PLUS: PlusStatus = { plan: 'none', expiresAt: null }

const LONGEST_MONTHLY_PERIOD_DAYS = 45

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
  if (plus.expirationDate === null) return { plan: 'lifetime', expiresAt: null }
  return { plan: subscriptionPlan(plus, plus.expirationDate), expiresAt: plus.expirationDate }
}
