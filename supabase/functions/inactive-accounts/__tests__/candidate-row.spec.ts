// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { candidateFrom, noticeRowOf, type CandidateRow } from '../candidate-row'

const ROW: CandidateRow = {
  user_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  email: 'sophie@exemple.test',
  locale: 'fr',
  email_confirmed: true,
  created_at: '2025-06-01T08:00:00.123456+00:00',
  has_plus: true,
  plus_expires_at: '2026-11-15T14:00:00+00:00',
  purge_on: '2027-11-16',
  warned_at: '2027-10-16T03:00:00+00:00',
  revenuecat_erased_at: null,
  inactive_since: '2026-11-15T14:00:00+00:00',
  step: 'delete',
  revenuecat_erasure_due: false,
}

describe('candidateFrom', () => {
  it('reprend les dates telles que la base les rend', () => {
    expect(candidateFrom(ROW)).toEqual({
      userId: ROW.user_id,
      email: 'sophie@exemple.test',
      locale: 'fr',
      dates: {
        createdAt: '2025-06-01T08:00:00.123456+00:00',
        emailConfirmed: true,
        plus: { expiresAt: '2026-11-15T14:00:00+00:00' },
        notice: {
          purgeOn: '2027-11-16',
          warnedAt: '2027-10-16T03:00:00+00:00',
          revenuecatErasedAt: null,
        },
      },
    })
  })

  it('distingue un compte jamais acheté d’un achat à vie', () => {
    expect(candidateFrom({ ...ROW, has_plus: false, plus_expires_at: null }).dates.plus).toBeNull()
    expect(candidateFrom({ ...ROW, has_plus: true, plus_expires_at: null }).dates.plus).toEqual({
      expiresAt: null,
    })
  })
})

describe('noticeRowOf', () => {
  it('écrit l’avis sous les noms de colonnes de la table', () => {
    expect(
      noticeRowOf(ROW.user_id, {
        inactiveSince: '2025-06-01T08:00:00.123456+00:00',
        purgeOn: '2027-11-16',
        warnedAt: '2027-10-16T03:00:00.000Z',
        revenuecatErasedAt: null,
      }),
    ).toEqual({
      user_id: ROW.user_id,
      inactive_since: '2025-06-01T08:00:00.123456+00:00',
      purge_on: '2027-11-16',
      warned_at: '2027-10-16T03:00:00.000Z',
      revenuecat_erased_at: null,
    })
  })
})
