// @vitest-environment node
import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorSummary } from '@/shared/utils/error-summary'
import { createAnimalPhotoDownload } from '../animal-photo-download'
import { PHOTO_TRANSFER_TIMEOUT_MS, StorageTimeoutError } from '../storage-timeout'

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

describe('createAnimalPhotoDownload — délai maximal', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function clientAnsweringAfter(ms: number | null) {
    const download = vi.fn<Download>(
      () =>
        new Promise((resolve) => {
          if (ms !== null) setTimeout(() => resolve({ data: new Blob([JPEG]), error: null }), ms)
        }),
    )
    return { storage: { from: () => ({ download }) } } as unknown as SupabaseClient
  }

  function track(promise: Promise<unknown>) {
    const outcome: { settled: boolean; value?: unknown; error?: unknown } = { settled: false }
    promise.then(
      (value) => Object.assign(outcome, { settled: true, value }),
      (error: unknown) => Object.assign(outcome, { settled: true, error }),
    )
    return outcome
  }

  it('fixe le délai d’un téléchargement à 60 s', () => {
    expect(PHOTO_TRANSFER_TIMEOUT_MS).toBe(60_000)
  })

  it('un téléchargement sans réponse rejette, à 60 s pile, une erreur à réessayer qui ne nomme pas la photo', async () => {
    vi.useFakeTimers()
    const outcome = track(
      createAnimalPhotoDownload(async () => clientAnsweringAfter(null)).download('user-1', PHOTO),
    )

    await vi.advanceTimersByTimeAsync(59_900)
    expect(outcome.settled).toBe(false)

    await vi.advanceTimersByTimeAsync(100)
    expect(outcome.error).toBeInstanceOf(StorageTimeoutError)
    expect(errorSummary(outcome.error)).not.toContain(PHOTO.slice(0, 8))
    expect(String(outcome.error)).not.toContain(PHOTO.slice(0, 8))
  })

  it('un téléchargement qui répond à 59 s rend la photo, sans minuteur laissé en suspens', async () => {
    vi.useFakeTimers()
    const outcome = track(
      createAnimalPhotoDownload(async () => clientAnsweringAfter(59_000)).download('user-1', PHOTO),
    )

    await vi.advanceTimersByTimeAsync(59_000)

    expect(outcome).toEqual({ settled: true, value: JPEG })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('une photo absente rendue à temps ne laisse aucun minuteur en suspens', async () => {
    vi.useFakeTimers()
    const { client } = fakeClient({ data: null, error: storageError(400, '404', 'NoSuchKey') })

    await expect(
      createAnimalPhotoDownload(async () => client).download('user-1', PHOTO),
    ).resolves.toBeNull()

    expect(vi.getTimerCount()).toBe(0)
  })
})
