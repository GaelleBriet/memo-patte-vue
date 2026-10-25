// @vitest-environment node
// Contre une pile Supabase locale jetable (`supabase start`), jamais le vrai projet :
// SUPABASE_LOCAL_URL=http://127.0.0.1:54321 SUPABASE_LOCAL_ANON_KEY=… SUPABASE_LOCAL_SECRET_KEY=… pnpm exec vitest run supabase/functions/inactive-accounts
// L'appel de la fonction demande en plus SUPABASE_LOCAL_CRON_SECRET, égal à l'INACTIVE_ACCOUNTS_CRON_SECRET du runtime local.
import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

import { candidateFrom, noticeRowOf, type CandidateRow } from '../candidate-row'
import { CRON_SECRET_HEADER } from '../inactive-accounts'
import { purgeStepsOf, type AccountDates, type PurgeNotice } from '../purge-calendar'

const url = process.env.SUPABASE_LOCAL_URL
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? ''
const secretKey = process.env.SUPABASE_LOCAL_SECRET_KEY ?? ''
const cronSecret = process.env.SUPABASE_LOCAL_CRON_SECRET

const DAY_MS = 24 * 60 * 60 * 1000
const NO_NOTICE: PurgeNotice = { purgeOn: null, warnedAt: null, revenuecatErasedAt: null }

type Case = { userId: string; dates: AccountDates; instants: number[] }

describe.skipIf(url === undefined)('inactive-accounts sur une pile Supabase locale', () => {
  let admin: SupabaseClient

  async function createAccount(confirmed = true): Promise<{ userId: string; createdAt: string }> {
    const created = await admin.auth.admin.createUser({
      email: `${randomUUID()}@exemple.test`,
      password: 'mot-de-passe-de-test',
      email_confirm: confirmed,
      user_metadata: { locale: 'fr' },
    })
    if (created.error) throw created.error
    return { userId: created.data.user.id, createdAt: created.data.user.created_at }
  }

  async function withPlus(
    expiresAt: string | null,
  ): Promise<{ userId: string; createdAt: string }> {
    const { userId, createdAt } = await createAccount()
    const { error } = await admin.from('plus_entitlements').insert({
      user_id: userId,
      active: expiresAt === null,
      product_type: expiresAt === null ? 'lifetime' : 'annual',
      expires_at: expiresAt,
    })
    if (error) throw error
    return { userId, createdAt }
  }

  async function rowsAt(at: number, userId: string): Promise<CandidateRow[]> {
    const { data, error } = await admin.rpc('inactive_account_steps', {
      at: new Date(at).toISOString(),
      only_account: userId,
    })
    if (error) throw error
    return data as CandidateRow[]
  }

  async function stepsAt(at: number, userId: string) {
    const [row] = await rowsAt(at, userId)
    return row
      ? { account: row.step, eraseRevenuecat: row.revenuecat_erasure_due, row }
      : { account: null, eraseRevenuecat: false, row: null }
  }

  function around(...boundaries: number[]): number[] {
    return boundaries.flatMap((boundary) => [boundary - 1, boundary, boundary + 1])
  }

  beforeAll(() => {
    admin = createClient(url!, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  })

  it('la liste SQL et le calendrier de la fonction donnent la même étape aux mêmes instants', async () => {
    const sinceCreation = (createdAt: string, days: number[]) =>
      days.flatMap((k) => {
        const at = Date.parse(createdAt) + k * DAY_MS
        return [at - 1, at + 1]
      })
    const ended = async (expiresAt: string, boundaries: string[]): Promise<Case> => {
      const { userId, createdAt } = await withPlus(expiresAt)
      return {
        userId,
        dates: { createdAt, emailConfirmed: true, plus: { expiresAt }, notice: NO_NOTICE },
        instants: [
          ...around(...boundaries.map(Date.parse)),
          ...sinceCreation(createdAt, [
            59,
            60,
            61,
            ...Array.from({ length: 12 }, (_, k) => 328 + k),
          ]),
        ],
      }
    }
    const lifetime = await withPlus(null)
    const never = await createAccount()
    const unconfirmed = await createAccount(false)
    const cases: Case[] = [
      await ended('2026-03-31T10:00:00.000Z', [
        '2026-05-30T10:00:00.000Z',
        '2027-02-28T10:00:00.000Z',
      ]),
      await ended('2028-02-29T10:00:00.000Z', [
        '2028-04-29T10:00:00.000Z',
        '2029-01-29T10:00:00.000Z',
      ]),
      await ended('2027-01-31T10:00:00.000Z', [
        '2027-04-01T10:00:00.000Z',
        '2027-12-31T10:00:00.000Z',
      ]),
      {
        userId: lifetime.userId,
        dates: {
          createdAt: lifetime.createdAt,
          emailConfirmed: true,
          plus: { expiresAt: null },
          notice: NO_NOTICE,
        },
        instants: [Date.parse('2040-01-01T00:00:00.000Z')],
      },
      {
        userId: never.userId,
        dates: { createdAt: never.createdAt, emailConfirmed: true, plus: null, notice: NO_NOTICE },
        instants: Array.from(
          { length: 12 },
          (_, k) => Date.parse(never.createdAt) + (328 + k) * DAY_MS,
        ).flatMap((at) => [at - 1, at + 1]),
      },
      {
        userId: unconfirmed.userId,
        dates: {
          createdAt: unconfirmed.createdAt,
          emailConfirmed: false,
          plus: null,
          notice: NO_NOTICE,
        },
        instants: [6, 7, 8].flatMap((days) => {
          const at = Date.parse(unconfirmed.createdAt) + days * DAY_MS
          return [at - 1, at + 1]
        }),
      },
    ]

    for (const { userId, dates, instants } of cases) {
      for (const at of instants) {
        const sql = await stepsAt(at, userId)
        const expected = purgeStepsOf(sql.row ? candidateFrom(sql.row).dates : dates, at)
        expect(
          { account: sql.account, eraseRevenuecat: sql.eraseRevenuecat },
          `${new Date(at).toISOString()} pour ${JSON.stringify(dates.plus)}`,
        ).toEqual(expected)
      }
    }
  })

  it('un avis enregistré par la fonction se relit, même daté à la microseconde de la création', async () => {
    const { userId, createdAt } = await createAccount()
    const warnAt = Date.parse(createdAt) + 340 * DAY_MS
    const [row] = await rowsAt(warnAt, userId)
    expect(row).toBeDefined()

    const notice = {
      inactiveSince: row!.inactive_since,
      purgeOn: new Date(warnAt + 31 * DAY_MS).toISOString().slice(0, 10),
      warnedAt: new Date(warnAt).toISOString(),
      revenuecatErasedAt: null,
    }
    const { error } = await admin
      .from('account_purge_notice')
      .upsert(noticeRowOf(userId, notice), { onConflict: 'user_id' })
    if (error) throw error

    expect((await stepsAt(warnAt + DAY_MS, userId)).account).toBe(null)
    const deletableFrom = Date.parse(`${notice.purgeOn}T00:00:00.000Z`) + DAY_MS
    const dates: AccountDates = {
      createdAt,
      emailConfirmed: true,
      plus: null,
      notice: { purgeOn: notice.purgeOn, warnedAt: notice.warnedAt, revenuecatErasedAt: null },
    }
    for (const at of around(deletableFrom)) {
      const sql = await stepsAt(at, userId)
      expect({ account: sql.account, eraseRevenuecat: sql.eraseRevenuecat }).toEqual(
        purgeStepsOf(dates, at),
      )
    }
    expect((await stepsAt(deletableFrom - 1, userId)).account).toBe(null)
    expect((await stepsAt(deletableFrom, userId)).account).toBe('delete')
    expect((await stepsAt(warnAt + 32 * DAY_MS, userId)).account).toBe('delete')
    expect(candidateFrom((await rowsAt(warnAt + 32 * DAY_MS, userId))[0]!).dates.notice).toEqual({
      purgeOn: notice.purgeOn,
      warnedAt: expect.any(String),
      revenuecatErasedAt: null,
    })
  })

  it('la fonction refuse un appel sans le secret du cron', async () => {
    const response = await fetch(`${url}/functions/v1/inactive-accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    })

    expect([401, 503]).toContain(response.status)
    await response.body?.cancel()
  })

  it.skipIf(cronSecret === undefined)(
    'la fonction passe à blanc, quoi que dise la demande',
    async () => {
      const response = await fetch(`${url}/functions/v1/inactive-accounts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
          [CRON_SECRET_HEADER]: cronSecret!,
        },
        body: JSON.stringify({ mode: 'apply' }),
      })

      expect(response.status).toBe(200)
      const report = await response.json()
      expect(report).toMatchObject({ mode: 'dry-run', channel: 'absent' })
      expect(report.done).toEqual({
        warnings: 0,
        deletions: 0,
        revenuecatErasures: 0,
        unconfirmedDeletions: 0,
      })
    },
  )
})
