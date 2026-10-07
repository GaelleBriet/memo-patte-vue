import type { PlusStatus, SubscriptionPlan } from './plus-status'

export type PlusStatusLabel = { key: string; expiresAt: string | null }

export function plusStatusLabel(
  status: PlusStatus,
  expiredPlan: SubscriptionPlan | null,
): PlusStatusLabel | null {
  if (expiredPlan !== null) {
    const key =
      expiredPlan === 'monthly'
        ? 'plus.settings.status.expiredMonthly'
        : 'plus.settings.status.expiredAnnual'
    return { key, expiresAt: null }
  }
  const { plan, expiresAt } = status
  if (plan === 'none') return null
  if (plan === 'lifetime') return { key: 'plus.settings.status.lifetime', expiresAt: null }
  if (expiresAt === null) return { key: `plus.member.${plan}`, expiresAt: null }
  return { key: `plus.settings.status.${plan}`, expiresAt }
}
