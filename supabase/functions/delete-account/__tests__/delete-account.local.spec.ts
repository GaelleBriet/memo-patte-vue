// @vitest-environment node
// Contre une pile Supabase locale jetable (`supabase start`), jamais le vrai projet :
// SUPABASE_LOCAL_URL=http://127.0.0.1:54321 SUPABASE_LOCAL_ANON_KEY=… SUPABASE_LOCAL_SERVICE_ROLE_KEY=… pnpm exec vitest run supabase/functions/delete-account
import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

const url = process.env.SUPABASE_LOCAL_URL
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ?? ''

const ACCOUNT_TABLES = [
  'animal',
  'weight_entry',
  'carnet_settings',
  'vaccination',
  'vaccination_injection',
  'treatment',
  'treatment_period',
  'treatment_dose',
  'device',
  'plus_entitlements',
  'sync_push',
] as const

const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0xff, 0xd9,
])

type Account = { userId: string; token: string; photo: string }

const options = { auth: { persistSession: false, autoRefreshToken: false } }

describe.skipIf(url === undefined)('delete-account sur une pile Supabase locale', () => {
  let admin: SupabaseClient
  let sophie: Account
  let other: Account

  async function createAccount(): Promise<Account> {
    const email = `${randomUUID()}@exemple.test`
    const password = 'mot-de-passe-de-test'
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    const userId = created.data.user.id
    const now = new Date().toISOString()
    const device = randomUUID()
    const stamps = {
      created_at: now,
      updated_at: now,
      created_by_device: device,
      updated_by_device: device,
    }
    const rows = await Promise.all([
      admin
        .from('plus_entitlements')
        .insert({ user_id: userId, active: true, product_type: 'annual' }),
      admin.from('animal').insert({
        user_id: userId,
        id: randomUUID(),
        name: 'Milo',
        species: 'dog',
        ...stamps,
      }),
      admin.from('device').insert({
        user_id: userId,
        id: device,
        installed_at: now,
        created_at: now,
        updated_at: now,
      }),
      admin.from('sync_push').insert({ user_id: userId, id: randomUUID(), sent_at: now }),
    ])
    for (const { error } of rows) if (error) throw error

    const client = createClient(url!, anonKey, options)
    const session = await client.auth.signInWithPassword({ email, password })
    if (session.error) throw session.error
    const photo = `${userId}/${randomUUID()}.jpg`
    const upload = await client.storage
      .from('animal-photos')
      .upload(photo, JPEG, { contentType: 'image/jpeg' })
    if (upload.error) throw upload.error
    return { userId, token: session.data.session.access_token, photo }
  }

  function callFunction(token: string): Promise<Response> {
    return fetch(`${url}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
  }

  async function leftovers(account: Account) {
    const user = await admin.auth.admin.getUserById(account.userId)
    const objects = await admin.storage.from('animal-photos').list(account.userId)
    const counts = await Promise.all(
      ACCOUNT_TABLES.map(async (table) => {
        const { count, error } = await admin
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', account.userId)
        if (error) throw error
        return [table, count] as const
      }),
    )
    return {
      user: user.data.user?.id ?? null,
      photos: (objects.data ?? []).map((object) => object.name),
      rows: Object.fromEntries(counts.filter(([, count]) => count !== 0)),
    }
  }

  beforeAll(async () => {
    const host = new URL(url!).hostname
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`Pile locale seulement, refusé : ${host}`)
    }
    admin = createClient(url!, serviceKey, options)
    sophie = await createAccount()
    other = await createAccount()
  })

  it('supprimer le compte seul laisserait ses photos dans le stockage', async () => {
    const owner = await createAccount()

    await admin.auth.admin.deleteUser(owner.userId, false)

    expect(await leftovers(owner)).toEqual({
      user: null,
      photos: [owner.photo.slice(owner.userId.length + 1)],
      rows: {},
    })
    await admin.storage.from('animal-photos').remove([owner.photo])
  })

  it('ne laisse rien du compte : ni utilisateur, ni photo, ni ligne', async () => {
    expect((await leftovers(sophie)).photos).toHaveLength(1)

    const response = await callFunction(sophie.token)

    expect(response.status).toBe(200)
    expect(await leftovers(sophie)).toEqual({ user: null, photos: [], rows: {} })
  })

  it('ne touche pas aux autres comptes', async () => {
    const after = await leftovers(other)

    expect(after.user).toBe(other.userId)
    expect(after.photos).toEqual([other.photo.slice(other.userId.length + 1)])
    expect(after.rows).toEqual({ plus_entitlements: 1, animal: 1, device: 1, sync_push: 1 })
  })

  it('refuse le jeton du compte supprimé', async () => {
    const response = await callFunction(sophie.token)

    expect(response.status).toBe(401)
  })
})
