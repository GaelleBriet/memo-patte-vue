// @vitest-environment node
import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorSummary } from '@/shared/utils/error-summary'
import { createAnimalPhotoDelete } from '../animal-photo-delete'
import { PHOTO_DELETE_TIMEOUT_MS, StorageTimeoutError } from '../storage-timeout'

const PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'

type Remove = (paths: string[]) => Promise<{ data: unknown[] | null; error: unknown }>
type GetSession = () => Promise<{
  data: { session: { user: { id: string } } | null }
  error: null
}>

function fakeClient(
  answer: { data: unknown[] | null; error: unknown },
  sessionUserId: string | null = 'user-1',
) {
  const remove = vi.fn<Remove>(async () => answer)
  const from = vi.fn<(bucket: string) => { remove: Remove }>(() => ({ remove }))
  const getSession = vi.fn<GetSession>(async () => ({
    data: { session: sessionUserId === null ? null : { user: { id: sessionUserId } } },
    error: null,
  }))
  const client = { storage: { from }, auth: { getSession } } as unknown as SupabaseClient
  return { client, from, remove }
}

const storageError = (status: number, statusCode: string, code?: string) =>
  new StorageApiError('refus', status, statusCode, 'storage', code)

describe('createAnimalPhotoDelete', () => {
  it('efface la photo du dossier du compte, sous le nom du carnet', async () => {
    const { client, from, remove } = fakeClient({ data: [{ name: PHOTO }], error: null })

    await createAnimalPhotoDelete(async () => client).delete('user-1', PHOTO)

    expect(from).toHaveBeenCalledExactlyOnceWith('animal-photos')
    expect(remove).toHaveBeenCalledExactlyOnceWith([`user-1/${PHOTO}`])
  })

  it.each([
    ['aucun objet effacé, sans erreur, session du compte', { data: [], error: null }],
    ['400, 404, NoSuchKey', { data: null, error: storageError(400, '404', 'NoSuchKey') }],
    ['le seul statusCode 404', { data: null, error: storageError(404, '404') }],
  ])('résout pour une photo déjà absente du dossier (%s)', async (_label, answer) => {
    const { client } = fakeClient(answer)

    await expect(
      createAnimalPhotoDelete(async () => client).delete('user-1', PHOTO),
    ).resolves.toBeUndefined()
  })

  it.each([
    ['sans session', null],
    ['avec la session d’un autre compte', 'user-2'],
  ])(
    'rejette une réponse vide %s : la RLS a pu la refuser sans erreur',
    async (_label, sessionUserId) => {
      const { client } = fakeClient({ data: [], error: null }, sessionUserId)

      await expect(
        createAnimalPhotoDelete(async () => client).delete('user-1', PHOTO),
      ).rejects.toThrow(/à réessayer/)
    },
  )

  it.each([
    ['un jeton invalide ou expiré', storageError(400, '403', 'AccessDenied')],
    ['une panne du serveur', storageError(503, '503')],
    ['un réseau coupé', new Error('fetch failed')],
  ])('rejette %s, pour réessayer plus tard', async (_label, error) => {
    const { client } = fakeClient({ data: null, error })

    await expect(createAnimalPhotoDelete(async () => client).delete('user-1', PHOTO)).rejects.toBe(
      error,
    )
  })
})

describe('createAnimalPhotoDelete — délai maximal', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function clientAnsweringAfter(ms: number | null) {
    const remove = vi.fn<Remove>(
      () =>
        new Promise((resolve) => {
          if (ms !== null) setTimeout(() => resolve({ data: [{ name: PHOTO }], error: null }), ms)
        }),
    )
    return { storage: { from: () => ({ remove }) } } as unknown as SupabaseClient
  }

  function track(promise: Promise<unknown>) {
    const outcome: { settled: boolean; error?: unknown } = { settled: false }
    promise.then(
      () => (outcome.settled = true),
      (error: unknown) => Object.assign(outcome, { settled: true, error }),
    )
    return outcome
  }

  it('fixe le délai d’un effacement à 30 s', () => {
    expect(PHOTO_DELETE_TIMEOUT_MS).toBe(30_000)
  })

  it('un effacement sans réponse rejette, à 30 s pile, une erreur à réessayer qui ne nomme pas la photo', async () => {
    vi.useFakeTimers()
    const outcome = track(
      createAnimalPhotoDelete(async () => clientAnsweringAfter(null)).delete('user-1', PHOTO),
    )

    await vi.advanceTimersByTimeAsync(29_900)
    expect(outcome.settled).toBe(false)

    await vi.advanceTimersByTimeAsync(100)
    expect(outcome.error).toBeInstanceOf(StorageTimeoutError)
    expect(errorSummary(outcome.error)).not.toContain(PHOTO.slice(0, 8))
    expect(String(outcome.error)).not.toContain(PHOTO.slice(0, 8))
  })

  it('un effacement qui répond à 29 s réussit, sans minuteur laissé en suspens', async () => {
    vi.useFakeTimers()
    const outcome = track(
      createAnimalPhotoDelete(async () => clientAnsweringAfter(29_000)).delete('user-1', PHOTO),
    )

    await vi.advanceTimersByTimeAsync(29_000)

    expect(outcome).toEqual({ settled: true })
    expect(vi.getTimerCount()).toBe(0)
  })
})
