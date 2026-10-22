// @vitest-environment node
import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { PhotoUploadRefusal } from '@/core/sync/service/photo-upload-port'
import { createAnimalPhotoUpload } from '../animal-photo-upload'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'

type Upload = (
  path: string,
  body: Uint8Array,
  options: { upsert: boolean; contentType: string },
) => Promise<{ data: unknown; error: unknown }>

function fakeClient(error: unknown = null) {
  const upload = vi.fn<Upload>(async () => ({ data: error ? null : { path: 'x' }, error }))
  const from = vi.fn<(bucket: string) => { upload: Upload }>(() => ({ upload }))
  const client = { storage: { from } } as unknown as SupabaseClient
  return { client, from, upload }
}

/** Réponses relevées sur une pile locale : statut HTTP 400, vrai code dans `statusCode`. */
const storageError = (statusCode: string, code: string) =>
  new StorageApiError('refus', 400, statusCode, 'storage', code)

describe('createAnimalPhotoUpload', () => {
  it('envoie le JPEG dans le dossier du compte, sous le nom du fichier local, en le remplaçant', async () => {
    const { client, from, upload } = fakeClient()

    await createAnimalPhotoUpload(async () => client).upload('user-1', PHOTO, JPEG)

    expect(from).toHaveBeenCalledExactlyOnceWith('animal-photos')
    expect(upload).toHaveBeenCalledExactlyOnceWith(`user-1/${PHOTO}`, JPEG, {
      upsert: true,
      contentType: 'image/jpeg',
    })
  })

  it.each([
    ['413', 'EntityTooLarge'],
    ['415', 'InvalidMimeType'],
    ['400', 'InvalidKey'],
  ])('rend un refus définitif pour %s %s', async (statusCode, code) => {
    const { client } = fakeClient(storageError(statusCode, code))

    const sent = createAnimalPhotoUpload(async () => client).upload('user-1', PHOTO, JPEG)

    await expect(sent).rejects.toEqual(new PhotoUploadRefusal(`${statusCode} ${code}`))
    await expect(sent).rejects.toBeInstanceOf(PhotoUploadRefusal)
  })

  it.each([
    ['un refus de droit (compte sans Plus actif)', storageError('403', 'AccessDenied')],
    ['une panne du serveur', storageError('503', 'ServiceUnavailable')],
    ['un réseau coupé', new Error('fetch failed')],
  ])('laisse réessayer %s', async (_label, error) => {
    const { client } = fakeClient(error)

    await expect(
      createAnimalPhotoUpload(async () => client).upload('user-1', PHOTO, JPEG),
    ).rejects.toBe(error)
  })
})
