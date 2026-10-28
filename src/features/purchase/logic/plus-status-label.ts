import { addYears } from 'date-fns'

import type { PlusStatus, SubscriptionPlan } from './plus-status'

const OFFERED_WITHOUT_END_YEARS = 50

export type PlusStatusLabel = { key: string; expiresAt: string | null }

export function plusStatusLabel(
  status: PlusStatus,
  expiredPlan: SubscriptionPlan | null,
  now: Date = new Date(),
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
  if (status.offered) return offeredLabel(expiresAt, now)
  if (plan === 'lifetime') return { key: 'plus.settings.status.lifetime', expiresAt: null }
  if (expiresAt === null) return { key: `plus.member.${plan}`, expiresAt: null }
  return { key: `plus.settings.status.${plan}`, expiresAt }
}

export function plusMemberLabel(status: PlusStatus, now: Date = new Date()): PlusStatusLabel {
  if (status.offered) return offeredLabel(status.expiresAt, now)
  return { key: `plus.member.${status.plan}`, expiresAt: null }
}

function offeredLabel(expiresAt: string | null, now: Date): PlusStatusLabel {
  if (
    expiresAt === null ||
    Date.parse(expiresAt) > addYears(now, OFFERED_WITHOUT_END_YEARS).getTime()
  )
    return { key: 'plus.settings.status.offeredNoEnd', expiresAt: null }
  return { key: 'plus.settings.status.offered', expiresAt }
}
