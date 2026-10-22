import { PLUS_ACCESS_RULES, type PlusAccessRules } from './plus-access-rules.ts'

export const PLUS_ENTITLEMENT = 'plus'

const LONGEST_MONTHLY_PERIOD_MS = 45 * 24 * 60 * 60 * 1000

type Instant = string | null | undefined

type RevenuecatPurchase = {
  purchase_date?: Instant
  expires_date?: Instant
  grace_period_expires_date?: Instant
  refunded_at?: Instant
  auto_resume_date?: Instant
}

type RevenuecatEntitlement = {
  expires_date: Instant
  grace_period_expires_date?: Instant
  product_identifier: string
  purchase_date?: Instant
}

/** Le sous-ensemble lu de `subscriber` dans la réponse de `GET /v1/subscribers/{id}`. */
export type RevenuecatSubscriber = {
  entitlements?: Record<string, RevenuecatEntitlement | undefined>
  subscriptions?: Record<string, (RevenuecatPurchase & Record<string, unknown>) | undefined>
  non_subscriptions?: Record<string, RevenuecatPurchase[] | undefined>
}

export type PlusProductType = 'monthly' | 'annual' | 'lifetime'

/** Une ligne de `plus_entitlements` ; `expiresAt` est la fin réelle de l'accès, `null` à vie. */
export type PlusAccess = { active: boolean; productType: PlusProductType; expiresAt: string | null }

function millis(value: Instant): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function purchaseOf(subscriber: RevenuecatSubscriber, product: string): RevenuecatPurchase {
  const subscription = subscriber.subscriptions?.[product]
  if (subscription) return subscription
  return subscriber.non_subscriptions?.[product]?.at(-1) ?? {}
}

function productTypeOf(
  entitlement: RevenuecatEntitlement,
  expires: number | null,
): PlusProductType {
  if (expires === null) return 'lifetime'
  const basePlan = entitlement.product_identifier.split(':')[1]
  if (basePlan === 'monthly' || basePlan === 'annual') return basePlan
  const purchased = millis(entitlement.purchase_date)
  if (purchased === null) return 'annual'
  return expires - purchased <= LONGEST_MONTHLY_PERIOD_MS ? 'monthly' : 'annual'
}

function later(end: number | null, candidate: number | null): number | null {
  if (end === null || candidate === null) return end
  return Math.max(end, candidate)
}

/** `null` : RevenueCat ne connaît aucun droit Plus à ce client. */
export function plusAccessFrom(
  subscriber: RevenuecatSubscriber,
  now: number,
  rules: PlusAccessRules = PLUS_ACCESS_RULES,
): PlusAccess | null {
  const entitlement = subscriber.entitlements?.[PLUS_ENTITLEMENT]
  if (!entitlement) return null
  const purchase = purchaseOf(subscriber, entitlement.product_identifier)
  const expires = millis(entitlement.expires_date)

  let end = later(
    expires,
    millis(entitlement.grace_period_expires_date ?? purchase.grace_period_expires_date),
  )
  if (!rules.pauseSuspendsBackup) end = later(end, millis(purchase.auto_resume_date))
  const refunded = millis(purchase.refunded_at)
  if (rules.refundEndsAccess && refunded !== null && (end === null || refunded < end)) {
    end = refunded
  }

  return {
    active: end === null || end > now,
    productType: productTypeOf(entitlement, expires),
    expiresAt: end === null ? null : new Date(end).toISOString(),
  }
}
