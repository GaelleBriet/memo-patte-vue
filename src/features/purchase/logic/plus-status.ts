import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesSubscriptionInfo,
} from '@revenuecat/purchases-capacitor'
import { differenceInDays, parseISO } from 'date-fns'

const PLUS_ENTITLEMENT = 'plus'

const OFFERED_STORE = 'PROMOTIONAL'
const GOOGLE_PLAY_STORE = 'PLAY_STORE'

export type PlusPlan = 'none' | 'monthly' | 'annual' | 'lifetime'

export type SubscriptionPlan = 'monthly' | 'annual'

export type PlusStatus = {
  plan: PlusPlan
  /** ISO 8601, `null` pour « aucun » et « à vie ». */
  expiresAt: string | null
  /** Droit offert depuis RevenueCat : rien à gérer dans Google Play. */
  offered?: boolean
  /** Vraie fin d'un droit échu, ISO 8601 : seulement avec `plan: 'none'`, quand RevenueCat la donne. */
  endedAt?: string
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

export function managedInGooglePlay(status: PlusStatus): boolean {
  return subscriptionOf(status) !== null && !status.offered
}

function subscriptionPlan(
  basePlan: string | null | undefined,
  purchasedAt: string,
  expiresAt: string,
): SubscriptionPlan {
  if (basePlan === 'monthly' || basePlan === 'annual') return basePlan

  const periodDays = differenceInDays(parseISO(expiresAt), parseISO(purchasedAt))
  return periodDays <= LONGEST_MONTHLY_PERIOD_DAYS ? 'monthly' : 'annual'
}

/** Un droit en période de grâce reste dans `entitlements.active`, donc compte comme actif. */
export function plusStatusFrom(customerInfo: CustomerInfo): PlusStatus {
  const plus = customerInfo.entitlements.active[PLUS_ENTITLEMENT]
  if (!plus) return endedStatusFrom(customerInfo)
  if (plus.store === OFFERED_STORE) {
    const googlePlay = activeGooglePlaySubscription(customerInfo)
    return googlePlay ? statusOfGooglePlaySubscription(googlePlay, plus) : offeredStatusFrom(plus)
  }
  return statusOfEntitlement(plus)
}

function statusOfEntitlement(plus: PurchasesEntitlementInfo): PlusStatus {
  if (plus.expirationDate === null) return { plan: 'lifetime', expiresAt: null }
  const basePlan = plus.productPlanIdentifier ?? plus.productIdentifier.split(':')[1]
  const plan = subscriptionPlan(basePlan, plus.latestPurchaseDate, plus.expirationDate)
  return { plan, expiresAt: plus.expirationDate }
}

function offeredStatusFrom(plus: PurchasesEntitlementInfo): PlusStatus {
  return { ...statusOfEntitlement(plus), offered: true }
}

function statusOfGooglePlaySubscription(
  subscription: PurchasesSubscriptionInfo,
  plus: PurchasesEntitlementInfo,
): PlusStatus {
  const { expiresDate } = subscription
  const basePlan =
    subscription.productPlanIdentifier ?? subscription.productIdentifier.split(':')[1]
  if (expiresDate === null) {
    const plan = basePlan === 'monthly' || basePlan === 'annual' ? basePlan : null
    return { plan: plan ?? statusOfEntitlement(plus).plan, expiresAt: null }
  }
  return {
    plan: subscriptionPlan(basePlan, subscription.purchaseDate, expiresDate),
    expiresAt: expiresDate,
  }
}

function endedStatusFrom(customerInfo: CustomerInfo): PlusStatus {
  const endedAt = customerInfo.entitlements.all[PLUS_ENTITLEMENT]?.expirationDate
  return endedAt && Date.parse(endedAt) <= Date.parse(customerInfo.requestDate)
    ? { ...NO_PLUS, endedAt }
    : NO_PLUS
}

/** Le droit ne remonte qu'un achat : un abonnement Google Play en cours peut se cacher derrière un droit offert. */
function activeGooglePlaySubscription(
  customerInfo: CustomerInfo,
): PurchasesSubscriptionInfo | undefined {
  return Object.values(customerInfo.subscriptionsByProductIdentifier)
    .filter((subscription) => subscription.isActive && subscription.store === GOOGLE_PLAY_STORE)
    .sort(
      (a, b) => (Date.parse(b.expiresDate ?? '') || 0) - (Date.parse(a.expiresDate ?? '') || 0),
    )[0]
}
