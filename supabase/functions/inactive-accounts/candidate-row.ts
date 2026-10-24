import type { PurgeCandidate, SavedNotice } from './purge-pass.ts'

/** Une ligne rendue par `public.inactive_account_steps`. */
export type CandidateRow = {
  user_id: string
  email: string | null
  locale: string | null
  email_confirmed: boolean
  created_at: string
  has_plus: boolean
  plus_expires_at: string | null
  purge_on: string | null
  warned_at: string | null
  revenuecat_erased_at: string | null
  inactive_since: string
  step: string | null
  revenuecat_erasure_due: boolean
}

export function candidateFrom(row: CandidateRow): PurgeCandidate {
  return {
    userId: row.user_id,
    email: row.email,
    locale: row.locale,
    dates: {
      createdAt: row.created_at,
      emailConfirmed: row.email_confirmed,
      plus: row.has_plus ? { expiresAt: row.plus_expires_at } : null,
      notice: {
        purgeOn: row.purge_on,
        warnedAt: row.warned_at,
        revenuecatErasedAt: row.revenuecat_erased_at,
      },
    },
  }
}

export function noticeRowOf(userId: string, notice: SavedNotice) {
  return {
    user_id: userId,
    inactive_since: notice.inactiveSince,
    purge_on: notice.purgeOn,
    warned_at: notice.warnedAt,
    revenuecat_erased_at: notice.revenuecatErasedAt,
  }
}
