// @vitest-environment node
import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { createAnimalPhotoDownload } from '../animal-photo-download'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'

type Download = (path: string) => Promise<{ data: Blob | null; error: unknown }>

function fakeClient(answer: { data: Blob | null; error: unknown }) {
  const download = vi.fn<Download>(async () => answer)
  const from = vi.fn<(bucket: string) => { download: Download }>(() => ({ download }))
  const client = { storage: { from } } as unknown as SupabaseClient
  return { client, from, download }
}

const storageError = (status: number, statusCode: string, code?: string) =>
  new StorageApiError('refus', status, statusCode, 'storage', code)

describe('createAnimalPhotoDownload', () => {
  it('lit la photo dans le dossier du compte, sous le nom du carnet, et rend ses octets', async () => {
    const { client, from, download } = fakeClient({ data: new Blob([JPEG]), error: null })

    const bytes = await createAnimalPhotoDownload(async () => client).download('user-1', PHOTO)

    expect(from).toHaveBeenCalledExactlyOnceWith('animal-photos')
    expect(download).toHaveBeenCalledExactlyOnceWith(`user-1/${PHOTO}`)
    expect(bytes).toEqual(JPEG)
  })

  it.each([
    [
      '400, 404, NoSuchKey : réponse relevée sur une pile locale',
      storageError(400, '404', 'NoSuchKey'),
    ],
    ['le seul statusCode 404', storageError(404, '404')],
    ['le seul code NoSuchKey', storageError(400, 'NoSuchKey', 'NoSuchKey')],
  ])('rend null pour une photo absente du dossier (%s)', async (_label, error) => {
    const { client } = fakeClient({ data: null, error })

    await expect(
      createAnimalPhotoDownload(async () => client).download('user-1', PHOTO),
    ).resolves.toBeNull()
  })

  it.each([
    ['un refus de droit', storageError(400, '403', 'AccessDenied')],
    ['une panne du serveur', storageError(503, '503')],
    ['un réseau coupé', new Error('fetch failed')],
  ])('rejette %s, pour réessayer plus tard', async (_label, error) => {
    const { client } = fakeClient({ data: null, error })

    await expect(
      createAnimalPhotoDownload(async () => client).download('user-1', PHOTO),
    ).rejects.toBe(error)
  })
})
