// @vitest-environment node
import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PhotoUploadRefusal } from '@/core/sync/service/photo-upload-port'
import { errorSummary } from '@/shared/utils/error-summary'
import { createAnimalPhotoUpload } from '../animal-photo-upload'
import { PHOTO_TRANSFER_TIMEOUT_MS, StorageTimeoutError } from '../storage-timeout'

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

  it.each(['EntityTooLarge', 'InvalidMimeType', 'InvalidKey'])(
    'rend un refus définitif pour %s même sans statusCode',
    async (code) => {
      const { client } = fakeClient({ name: 'StorageApiError', status: 400, code })

      await expect(
        createAnimalPhotoUpload(async () => client).upload('user-1', PHOTO, JPEG),
      ).rejects.toEqual(new PhotoUploadRefusal(code))
    },
  )

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

describe('createAnimalPhotoUpload — délai maximal', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function clientAnsweringAfter(ms: number | null) {
    const upload = vi.fn<Upload>(
      () =>
        new Promise((resolve) => {
          if (ms !== null) setTimeout(() => resolve({ data: { path: 'x' }, error: null }), ms)
        }),
    )
    return { storage: { from: () => ({ upload }) } } as unknown as SupabaseClient
  }

  function track(promise: Promise<unknown>) {
    const outcome: { settled: boolean; error?: unknown } = { settled: false }
    promise.then(
      () => (outcome.settled = true),
      (error: unknown) => Object.assign(outcome, { settled: true, error }),
    )
    return outcome
  }

  it('fixe le délai d’un envoi à 60 s', () => {
    expect(PHOTO_TRANSFER_TIMEOUT_MS).toBe(60_000)
  })

  it('un envoi sans réponse rejette, à 60 s pile, une erreur à réessayer qui ne nomme pas la photo', async () => {
    vi.useFakeTimers()
    const outcome = track(
      createAnimalPhotoUpload(async () => clientAnsweringAfter(null)).upload('user-1', PHOTO, JPEG),
    )

    await vi.advanceTimersByTimeAsync(59_900)
    expect(outcome.settled).toBe(false)

    await vi.advanceTimersByTimeAsync(100)
    expect(outcome.error).toBeInstanceOf(StorageTimeoutError)
    expect(outcome.error).not.toBeInstanceOf(PhotoUploadRefusal)
    expect(errorSummary(outcome.error)).not.toContain(PHOTO.slice(0, 8))
    expect(String(outcome.error)).not.toContain(PHOTO.slice(0, 8))
  })

  it('un envoi qui répond à 59 s réussit, sans minuteur laissé en suspens', async () => {
    vi.useFakeTimers()
    const outcome = track(
      createAnimalPhotoUpload(async () => clientAnsweringAfter(59_000)).upload(
        'user-1',
        PHOTO,
        JPEG,
      ),
    )

    await vi.advanceTimersByTimeAsync(59_000)

    expect(outcome).toEqual({ settled: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un envoi qui répond tout de suite ne laisse aucun minuteur en suspens', async () => {
    vi.useFakeTimers()
    const { client } = fakeClient()

    await createAnimalPhotoUpload(async () => client).upload('user-1', PHOTO, JPEG)

    expect(vi.getTimerCount()).toBe(0)
  })

  it('un refus rendu à temps ne laisse aucun minuteur en suspens', async () => {
    vi.useFakeTimers()
    const { client } = fakeClient(new Error('fetch failed'))

    await expect(
      createAnimalPhotoUpload(async () => client).upload('user-1', PHOTO, JPEG),
    ).rejects.toThrow('fetch failed')

    expect(vi.getTimerCount()).toBe(0)
  })
})
