// @vitest-environment node
// Contre une pile Supabase locale jetable (`supabase start`, puis scripts/supabase-local/require-current-password.sh), jamais le vrai projet ;
// `docker` recule l'âge d'une session dans sa base :
// SUPABASE_LOCAL_URL=http://127.0.0.1:54321 SUPABASE_LOCAL_ANON_KEY=… SUPABASE_LOCAL_SECRET_KEY=… pnpm exec vitest run password-update.local
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { disposableAccounts } from '../../../../scripts/supabase-local/disposable-accounts'
import { AccountError } from '../logic/account-error'
import { createAuthRepository, type AuthRepository } from '../repository/auth.repository'

const url = process.env.SUPABASE_LOCAL_URL
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? ''
const secretKey = process.env.SUPABASE_LOCAL_SECRET_KEY ?? ''

const options = { auth: { persistSession: false, autoRefreshToken: false } }

const DB_CONTAINER = 'supabase_db_supabase-migrations'

const CURRENT = 'mot-de-passe-actuel'
const NEXT = 'nouveau-mot-de-passe'

async function refusalOf(promise: Promise<unknown>): Promise<{ reason: string; code: unknown }> {
  const error = await promise.then(
    () => {
      throw new Error('changement accepté alors qu’un refus était attendu')
    },
    (cause: unknown) => cause,
  )
  expect(error).toBeInstanceOf(AccountError)
  const { reason, cause } = error as AccountError
  return { reason, code: (cause as { code?: unknown } | undefined)?.code }
}

describe.skipIf(url === undefined)('mot de passe actuel exigé par la pile Supabase locale', () => {
  let admin: SupabaseClient
  const accounts = disposableAccounts()

  type Account = { email: string; client: SupabaseClient; repository: AuthRepository }

  function anonymous(email: string): Account {
    const client = createClient(url!, anonKey, options)
    return { email, client, repository: createAuthRepository({ loadClient: async () => client }) }
  }

  async function account(): Promise<Account> {
    const email = `${randomUUID()}@exemple.test`
    const created = await admin.auth.admin.createUser({
      email,
      password: CURRENT,
      email_confirm: true,
    })
    if (created.error) throw created.error
    accounts.created(created.data.user.id)
    return anonymous(email)
  }

  async function signedUpWithCode(): Promise<Account> {
    const email = `${randomUUID()}@exemple.test`
    const link = await admin.auth.admin.generateLink({ type: 'signup', email, password: CURRENT })
    if (link.error) throw link.error
    accounts.created(link.data.user.id)
    const signedUp = anonymous(email)
    await signedUp.repository.verifySignUpCode(email, link.data.properties.email_otp)
    return signedUp
  }

  async function sessionOpened25HoursAgo(client: SupabaseClient): Promise<void> {
    const { data } = await client.auth.getSession()
    const payload = data.session?.access_token.split('.')[1] ?? ''
    const { session_id } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      session_id: string
    }
    expect(session_id).toMatch(/^[0-9a-f-]{36}$/)
    const output = execFileSync('docker', [
      'exec',
      DB_CONTAINER,
      'psql',
      '--username=postgres',
      '--command',
      `update auth.sessions set created_at = now() - interval '25 hours' where id = '${session_id}'`,
    ]).toString()
    if (!output.includes('UPDATE 1')) {
      throw new Error('session non reculée : SUPABASE_LOCAL_URL vise-t-il la bonne pile ?')
    }
  }

  async function opensWith(email: string, password: string): Promise<boolean> {
    const { error } = await createClient(url!, anonKey, options).auth.signInWithPassword({
      email,
      password,
    })
    return error === null
  }

  beforeAll(() => {
    admin = createClient(url!, secretKey, options)
  })

  afterAll(() => accounts.removeAll(admin))

  it('« Changer mon mot de passe » : accepté avec le bon mot de passe actuel', async () => {
    const { email, repository } = await account()
    await repository.signIn(email, CURRENT)
    await repository.reauthenticate(CURRENT)

    await repository.updatePassword(NEXT, CURRENT)

    expect(await opensWith(email, NEXT)).toBe(true)
  })

  it('refuse le changement sans mot de passe actuel pour une session ouverte par mot de passe', async () => {
    const { email, repository } = await account()
    await repository.signIn(email, CURRENT)

    expect(await refusalOf(repository.updatePassword(NEXT))).toEqual({
      reason: 'unknown',
      code: 'current_password_required',
    })
    expect(await opensWith(email, CURRENT)).toBe(true)
  })

  it('traduit un mot de passe actuel faux en « mot de passe incorrect »', async () => {
    const { email, repository } = await account()
    await repository.signIn(email, CURRENT)

    const refusal = await refusalOf(repository.updatePassword(NEXT, 'pas-le-bon'))
    expect(refusal.reason).toBe('invalid-credentials')
    expect(['current_password_invalid', 'current_password_mismatch']).toContain(refusal.code)
    expect(await opensWith(email, CURRENT)).toBe(true)
  })

  it('« Mot de passe oublié » : la session du code reçu change le mot de passe sans l’actuel', async () => {
    const { email, repository } = await account()
    const link = await admin.auth.admin.generateLink({ type: 'recovery', email })
    if (link.error) throw link.error

    await repository.verifyPasswordResetCode(email, link.data.properties.email_otp)
    await repository.updatePassword(NEXT)

    expect(await opensWith(email, NEXT)).toBe(true)
  })

  describe('avec « Secure password change » (session de moins de 24 h exigée)', () => {
    it('limite : une session ouverte par le code d’inscription, de moins de 24 h, change le mot de passe sans l’actuel', async () => {
      const { email, repository } = await signedUpWithCode()

      await repository.updatePassword(NEXT)

      expect(await opensWith(email, NEXT)).toBe(true)
    })

    it('refuse la même session au-delà de 24 h, même sans session par mot de passe', async () => {
      const { email, client, repository } = await signedUpWithCode()
      await sessionOpened25HoursAgo(client)

      expect(await refusalOf(repository.updatePassword(NEXT))).toEqual({
        reason: 'unknown',
        code: 'reauthentication_needed',
      })
      expect(await opensWith(email, CURRENT)).toBe(true)
    })

    it('refuse une session par mot de passe de plus de 24 h, même avec l’actuel', async () => {
      const { email, client, repository } = await account()
      await repository.signIn(email, CURRENT)
      await sessionOpened25HoursAgo(client)

      expect(await refusalOf(repository.updatePassword(NEXT, CURRENT))).toEqual({
        reason: 'unknown',
        code: 'reauthentication_needed',
      })
    })

    it('« Changer mon mot de passe » passe sur une session de plus de 24 h : la reconnexion en ouvre une neuve', async () => {
      const { email, client, repository } = await account()
      await repository.signIn(email, CURRENT)
      await sessionOpened25HoursAgo(client)

      await repository.reauthenticate(CURRENT)
      await repository.updatePassword(NEXT, CURRENT)

      expect(await opensWith(email, NEXT)).toBe(true)
    })
  })
})
