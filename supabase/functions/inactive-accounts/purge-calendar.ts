export const UNCONFIRMED_ACCOUNT_DAYS = 7
export const REVENUECAT_ERASURE_DAYS = 60
export const WARNING_MONTHS = 11
export const INACTIVITY_MONTHS = 12
export const MIN_NOTICE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** L'avis enregistré pour la fin d'accès actuelle ; un avis d'avant une reprise de Plus n'y figure pas. */
export type PurgeNotice = {
  purgeOn: string | null
  warnedAt: string | null
  revenuecatErasedAt: string | null
}

export type AccountDates = {
  createdAt: string
  emailConfirmed: boolean
  /** `null` : jamais acheté ; `expiresAt` à `null` : achat à vie. */
  plus: { expiresAt: string | null } | null
  notice: PurgeNotice
}

export type AccountStep = 'warn' | 'delete' | 'delete-unconfirmed' | null

export type PurgeSteps = { account: AccountStep; eraseRevenuecat: boolean }

function addDays(instant: number, days: number): number {
  return instant + days * DAY_MS
}

/** Comme Postgres en UTC : le 31 mars plus 11 mois tombe le 28 (ou 29) février. */
function addMonths(instant: number, months: number): number {
  const date = new Date(instant)
  const target = new Date(instant)
  target.setUTCDate(1)
  target.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  return target.getTime()
}

function startOfUtcDay(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`)
}

/** `null` : abonnement en cours ou achat à vie, le compte n'est jamais inactif. */
export function inactiveSinceOf(dates: AccountDates, now: number): string | null {
  if (!dates.plus) return dates.createdAt
  const { expiresAt } = dates.plus
  if (expiresAt === null || Date.parse(expiresAt) > now) return null
  return expiresAt
}

export function purgeStepsOf(dates: AccountDates, now: number): PurgeSteps {
  const since = inactiveSinceOf(dates, now)
  if (since === null) return { account: null, eraseRevenuecat: false }
  const reference = Date.parse(since)
  const { notice } = dates

  let account: AccountStep = null
  if (!dates.emailConfirmed) {
    if (addDays(Date.parse(dates.createdAt), UNCONFIRMED_ACCOUNT_DAYS) <= now) {
      account = 'delete-unconfirmed'
    }
  } else if (notice.warnedAt !== null && notice.purgeOn !== null) {
    if (startOfUtcDay(notice.purgeOn) <= now) account = 'delete'
  } else if (addMonths(reference, WARNING_MONTHS) <= now) {
    account = 'warn'
  }

  const eraseRevenuecat =
    dates.plus !== null &&
    notice.revenuecatErasedAt === null &&
    addDays(reference, REVENUECAT_ERASURE_DAYS) <= now &&
    account !== 'delete' &&
    account !== 'delete-unconfirmed'

  return { account, eraseRevenuecat }
}

/** Le jour J, en UTC : jamais avant 12 mois d'inactivité ni avant 30 jours de préavis. */
export function purgeDateOf(inactiveSince: string, warnedAt: number): string {
  const earliest = Math.max(
    addMonths(Date.parse(inactiveSince), INACTIVITY_MONTHS),
    addDays(warnedAt, MIN_NOTICE_DAYS),
  )
  const intoDay = earliest % DAY_MS
  const day = intoDay === 0 ? earliest : earliest - intoDay + DAY_MS
  return new Date(day).toISOString().slice(0, 10)
}
