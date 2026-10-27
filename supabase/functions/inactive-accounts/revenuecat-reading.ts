import { plusAccessFrom, type RevenuecatSubscriber } from '../_shared/plus-access.ts'
import { inactiveSinceOf, purgeDateOf, type AccountDates } from './purge-calendar.ts'

const NO_NOTICE = { purgeOn: null, warnedAt: null, revenuecatErasedAt: null }

/** `laterEnd` : RevenueCat seul connaît la fin d'accès retenue, la base n'en garde aucune trace. */
export type RevenuecatReading =
  { subscribed: true } | { subscribed: false; dates: AccountDates; laterEnd: boolean }

/** Google Play rend l'accès à la date de reprise : une pause en cours vaut un abonnement. */
function pausedUntilLater(subscriber: RevenuecatSubscriber, now: number): boolean {
  return Object.values(subscriber.subscriptions ?? {}).some((purchase) => {
    const resumesAt = purchase?.auto_resume_date
    return typeof resumesAt === 'string' && Date.parse(resumesAt) > now
  })
}

/** Un achat ou un renouvellement que le webhook n'a pas écrit : la fin connue de RevenueCat compte. */
export function readAtRevenuecat(
  subscriber: RevenuecatSubscriber,
  dates: AccountDates,
  now: number,
): RevenuecatReading {
  if (pausedUntilLater(subscriber, now)) return { subscribed: true }
  const access = plusAccessFrom(subscriber, now)
  if (!access) return { subscribed: false, dates, laterEnd: false }
  if (access.active || access.expiresAt === null) return { subscribed: true }

  const ended = Date.parse(access.expiresAt)
  const known = dates.plus?.expiresAt
  if (typeof known === 'string' && ended <= Date.parse(known)) {
    return { subscribed: false, dates, laterEnd: false }
  }
  const withEnd = { ...dates, plus: { expiresAt: access.expiresAt } }
  const since = inactiveSinceOf(withEnd, now)
  const baseSince = inactiveSinceOf(dates, now)
  if (since === null || baseSince === null || Date.parse(since) <= Date.parse(baseSince)) {
    return { subscribed: false, dates: withEnd, laterEnd: false }
  }
  const { warnedAt, purgeOn } = dates.notice
  const warnedFromThisEnd =
    warnedAt !== null &&
    purgeOn !== null &&
    Date.parse(warnedAt) >= ended &&
    purgeOn >= purgeDateOf(since, Date.parse(warnedAt))
  return {
    subscribed: false,
    dates: { ...withEnd, notice: warnedFromThisEnd ? dates.notice : NO_NOTICE },
    laterEnd: true,
  }
}
