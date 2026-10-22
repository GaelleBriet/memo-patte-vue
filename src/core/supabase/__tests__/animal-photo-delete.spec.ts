// @vitest-environment node
import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { createAnimalPhotoDelete } from '../animal-photo-delete'

const PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'

type Remove = (paths: string[]) => Promise<{ data: unknown[] | null; error: unknown }>

function fakeClient(
  answer: { data: unknown[] | null; error: unknown },
  sessionUserId: string | null = 'user-1',
) {
  const remove = vi.fn<Remove>(async () => answer)
  const from = vi.fn<(bucket: string) => { remove: Remove }>(() => ({ remove }))
  const getSession = vi.fn(async () => ({
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
      ).rejects.toThrow()
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
