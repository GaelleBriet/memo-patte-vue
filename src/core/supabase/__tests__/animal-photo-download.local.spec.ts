// @vitest-environment node
// Contre une pile Supabase locale jetable (`supabase start`), jamais le vrai projet :
// SUPABASE_LOCAL_URL=http://127.0.0.1:54321 SUPABASE_LOCAL_ANON_KEY=… SUPABASE_LOCAL_SERVICE_ROLE_KEY=… pnpm exec vitest run src/core/supabase
import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

import { createAnimalPhotoDownload } from '../animal-photo-download'
import { createAnimalPhotoUpload } from '../animal-photo-upload'

const url = process.env.SUPABASE_LOCAL_URL
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ?? ''

const options = { auth: { persistSession: false, autoRefreshToken: false } }

function jpeg(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(7)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

const photoName = () => `${randomUUID()}.jpg`

describe.skipIf(url === undefined)('téléchargement des photos sur une pile Supabase locale', () => {
  let admin: SupabaseClient

  async function signedIn(plus: boolean): Promise<{ userId: string; client: SupabaseClient }> {
    const email = `${randomUUID()}@exemple.test`
    const password = 'mot-de-passe-de-test'
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    const userId = created.data.user.id
    if (plus) {
      const { error } = await admin
        .from('plus_entitlements')
        .insert({ user_id: userId, active: true, product_type: 'annual' })
      if (error) throw error
    }
    const client = createClient(url!, anonKey, options)
    const signed = await client.auth.signInWithPassword({ email, password })
    if (signed.error) throw signed.error
    return { userId, client }
  }

  async function storedPhoto(client: SupabaseClient, userId: string): Promise<string> {
    const name = photoName()
    await createAnimalPhotoUpload(async () => client).upload(userId, name, jpeg(64))
    return name
  }

  beforeAll(() => {
    admin = createClient(url!, serviceKey, options)
  })

  it('rend les octets envoyés, même pour un compte dont Plus n’est plus actif', async () => {
    const { userId, client } = await signedIn(true)
    const name = await storedPhoto(client, userId)
    const { error } = await admin
      .from('plus_entitlements')
      .update({ active: false })
      .eq('user_id', userId)
    if (error) throw error

    const bytes = await createAnimalPhotoDownload(async () => client).download(userId, name)

    expect(bytes).toEqual(jpeg(64))
  })

  it('rend null pour une photo absente du dossier', async () => {
    const { userId, client } = await signedIn(false)

    await expect(
      createAnimalPhotoDownload(async () => client).download(userId, photoName()),
    ).resolves.toBeNull()
  })

  it('ne rend jamais la photo d’un autre compte', async () => {
    const owner = await signedIn(true)
    const name = await storedPhoto(owner.client, owner.userId)
    const intruder = await signedIn(true)

    await expect(
      createAnimalPhotoDownload(async () => intruder.client).download(owner.userId, name),
    ).resolves.toBeNull()
  })

  it('rejette, pour réessayer plus tard, un serveur injoignable', async () => {
    const unreachable = createClient('http://127.0.0.1:9', anonKey, options)

    await expect(
      createAnimalPhotoDownload(async () => unreachable).download(randomUUID(), photoName()),
    ).rejects.toBeDefined()
  })
})
