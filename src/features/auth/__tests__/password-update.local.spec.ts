// @vitest-environment node
// Contre une pile Supabase locale jetable (`supabase start`, puis scripts/supabase-local/require-current-password.sh), jamais le vrai projet :
// SUPABASE_LOCAL_URL=http://127.0.0.1:54321 SUPABASE_LOCAL_ANON_KEY=… SUPABASE_LOCAL_SERVICE_ROLE_KEY=… pnpm exec vitest run password-update.local
import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

import { AccountError } from '../logic/account-error'
import { createAuthRepository, type AuthRepository } from '../repository/auth.repository'

const url = process.env.SUPABASE_LOCAL_URL
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ?? ''

const options = { auth: { persistSession: false, autoRefreshToken: false } }

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

  async function account(): Promise<{ email: string; repository: AuthRepository }> {
    const email = `${randomUUID()}@exemple.test`
    const created = await admin.auth.admin.createUser({
      email,
      password: CURRENT,
      email_confirm: true,
    })
    if (created.error) throw created.error
    const client = createClient(url!, anonKey, options)
    return { email, repository: createAuthRepository({ loadClient: async () => client }) }
  }

  async function opensWith(email: string, password: string): Promise<boolean> {
    const { error } = await createClient(url!, anonKey, options).auth.signInWithPassword({
      email,
      password,
    })
    return error === null
  }

  beforeAll(() => {
    admin = createClient(url!, serviceKey, options)
  })

  it('« Changer mon mot de passe » : accepté avec le bon mot de passe actuel', async () => {
    const { email, repository } = await account()
    await repository.signIn(email, CURRENT)
    await repository.reauthenticate(CURRENT)

    await repository.updatePassword(NEXT, CURRENT)

    expect(await opensWith(email, NEXT)).toBe(true)
  })

  it('refuse le changement sans mot de passe actuel, hors récupération', async () => {
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
})
