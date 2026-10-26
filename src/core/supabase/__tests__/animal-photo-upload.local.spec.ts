// @vitest-environment node
// Contre une pile Supabase locale jetable (`supabase start`), jamais le vrai projet :
// SUPABASE_LOCAL_URL=http://127.0.0.1:54321 SUPABASE_LOCAL_ANON_KEY=… SUPABASE_LOCAL_SECRET_KEY=… pnpm exec vitest run src/core/supabase
import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { disposableAccounts } from '../../../../scripts/supabase-local/disposable-accounts'
import { PhotoUploadRefusal } from '@/core/sync/service/photo-upload-port'
import { createAnimalPhotoUpload } from '../animal-photo-upload'

const url = process.env.SUPABASE_LOCAL_URL
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? ''
const secretKey = process.env.SUPABASE_LOCAL_SECRET_KEY ?? ''

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

function jpeg(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

const photoName = () => `${randomUUID()}.jpg`

describe.skipIf(url === undefined)('envoi des photos sur une pile Supabase locale', () => {
  let admin: SupabaseClient
  const accounts = disposableAccounts(url)

  async function signedIn(plus: boolean): Promise<{ userId: string; client: SupabaseClient }> {
    const email = `${randomUUID()}@exemple.test`
    const password = 'mot-de-passe-de-test'
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    const userId = accounts.created(created.data.user.id)
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

  async function storedSizes(userId: string): Promise<Record<string, number>> {
    const { data, error } = await admin.storage.from('animal-photos').list(userId)
    if (error) throw error
    return Object.fromEntries(data.map(({ name, metadata }) => [name, Number(metadata?.size)]))
  }

  beforeAll(() => {
    admin = createClient(url!, secretKey, options)
  })

  afterAll(() => accounts.removeAll(admin))

  it('envoie une photo avec Plus actif, et un renvoi remplace l’objet sans erreur', async () => {
    const { userId, client } = await signedIn(true)
    const uploads = createAnimalPhotoUpload(async () => client)
    const name = photoName()

    await uploads.upload(userId, name, jpeg(16))
    await uploads.upload(userId, name, jpeg(32))

    expect(await storedSizes(userId)).toEqual({ [name]: 32 })
  })

  it('accepte une photo de 2 Mio pile et refuse définitivement un octet de plus', async () => {
    const { userId, client } = await signedIn(true)
    const uploads = createAnimalPhotoUpload(async () => client)
    const accepted = photoName()

    await uploads.upload(userId, accepted, jpeg(MAX_PHOTO_BYTES))
    await expect(uploads.upload(userId, photoName(), jpeg(MAX_PHOTO_BYTES + 1))).rejects.toEqual(
      new PhotoUploadRefusal('413 EntityTooLarge'),
    )

    expect(await storedSizes(userId)).toEqual({ [accepted]: MAX_PHOTO_BYTES })
  })

  it('laisse réessayer un compte sans Plus actif : le refus de droit n’est pas définitif', async () => {
    const { userId, client } = await signedIn(false)

    const sent = createAnimalPhotoUpload(async () => client).upload(userId, photoName(), jpeg(16))

    await expect(sent).rejects.toMatchObject({ statusCode: '403', code: 'AccessDenied' })
    await expect(sent).rejects.not.toBeInstanceOf(PhotoUploadRefusal)
    expect(await storedSizes(userId)).toEqual({})
  })

  it('laisse réessayer un serveur injoignable', async () => {
    const unreachable = createClient('http://127.0.0.1:9', anonKey, options)

    const sent = createAnimalPhotoUpload(async () => unreachable).upload(
      randomUUID(),
      photoName(),
      jpeg(16),
    )

    await expect(sent).rejects.not.toBeInstanceOf(PhotoUploadRefusal)
  })
})
