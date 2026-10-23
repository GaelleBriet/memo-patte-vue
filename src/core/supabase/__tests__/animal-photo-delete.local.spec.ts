// @vitest-environment node
// Contre une pile Supabase locale jetable (`supabase start`), jamais le vrai projet :
// SUPABASE_LOCAL_URL=http://127.0.0.1:54321 SUPABASE_LOCAL_ANON_KEY=… SUPABASE_LOCAL_SERVICE_ROLE_KEY=… pnpm exec vitest run src/core/supabase
import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

import { createAnimalPhotoDelete } from '../animal-photo-delete'
import { createAnimalPhotoDownload } from '../animal-photo-download'
import { createAnimalPhotoUpload } from '../animal-photo-upload'

const url = process.env.SUPABASE_LOCAL_URL
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ?? ''

const options = { auth: { persistSession: false, autoRefreshToken: false } }

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7, 7])
const photoName = () => `${randomUUID()}.jpg`

describe.skipIf(url === undefined)('effacement des photos sur une pile Supabase locale', () => {
  let admin: SupabaseClient

  async function signedIn(): Promise<{ userId: string; client: SupabaseClient }> {
    const email = `${randomUUID()}@exemple.test`
    const password = 'mot-de-passe-de-test'
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    const userId = created.data.user.id
    const { error } = await admin
      .from('plus_entitlements')
      .insert({ user_id: userId, active: true, product_type: 'annual' })
    if (error) throw error
    const client = createClient(url!, anonKey, options)
    const signed = await client.auth.signInWithPassword({ email, password })
    if (signed.error) throw signed.error
    return { userId, client }
  }

  async function storedPhoto(client: SupabaseClient, userId: string): Promise<string> {
    const name = photoName()
    await createAnimalPhotoUpload(async () => client).upload(userId, name, JPEG)
    return name
  }

  beforeAll(() => {
    admin = createClient(url!, serviceKey, options)
  })

  it('efface la photo du dossier, même pour un compte dont Plus n’est plus actif', async () => {
    const { userId, client } = await signedIn()
    const name = await storedPhoto(client, userId)
    const { error } = await admin
      .from('plus_entitlements')
      .update({ active: false })
      .eq('user_id', userId)
    if (error) throw error

    await createAnimalPhotoDelete(async () => client).delete(userId, name)

    await expect(
      createAnimalPhotoDownload(async () => client).download(userId, name),
    ).resolves.toBeNull()
  })

  it('résout pour une photo absente du dossier', async () => {
    const { userId, client } = await signedIn()

    await expect(
      createAnimalPhotoDelete(async () => client).delete(userId, photoName()),
    ).resolves.toBeUndefined()
  })

  it('n’efface jamais la photo d’un autre compte', async () => {
    const owner = await signedIn()
    const name = await storedPhoto(owner.client, owner.userId)
    const intruder = await signedIn()

    await expect(
      createAnimalPhotoDelete(async () => intruder.client).delete(owner.userId, name),
    ).rejects.toThrow('Session absente ou d’un autre compte')
    await expect(
      createAnimalPhotoDownload(async () => owner.client).download(owner.userId, name),
    ).resolves.toEqual(JPEG)
  })

  it('rejette, pour réessayer plus tard, un serveur injoignable', async () => {
    const unreachable = createClient('http://127.0.0.1:9', anonKey, options)

    await expect(
      createAnimalPhotoDelete(async () => unreachable).delete(randomUUID(), photoName()),
    ).rejects.toBeDefined()
  })
})
