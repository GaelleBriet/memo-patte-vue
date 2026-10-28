// @vitest-environment node
import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ANIMAL_PHOTO_LIST_PAGE_SIZE, createAnimalPhotoList } from '../animal-photo-list'
import { PHOTO_LIST_TIMEOUT_MS, StorageTimeoutError } from '../storage-timeout'

type ListOptions = { limit: number; offset: number; sortBy: { column: string; order: string } }
type ListAnswer = { data: unknown[] | null; error: unknown }
type List = (path: string, options: ListOptions) => Promise<ListAnswer>

const stored = (name: string, createdAt = '2026-10-01T08:00:00.000Z', updatedAt = createdAt) => ({
  name,
  id: `id-${name}`,
  created_at: createdAt,
  updated_at: updatedAt,
  last_accessed_at: updatedAt,
  metadata: { size: 1000, mimetype: 'image/jpeg' },
})

function fakeClient(pages: ListAnswer[] | ((path: string, options: ListOptions) => ListAnswer)) {
  const list = vi.fn<List>(async (path, options) =>
    typeof pages === 'function'
      ? pages(path, options)
      : (pages[options.offset / ANIMAL_PHOTO_LIST_PAGE_SIZE] ?? { data: [], error: null }),
  )
  const from = vi.fn<(bucket: string) => { list: List }>(() => ({ list }))
  const client = { storage: { from } } as unknown as SupabaseClient
  return { client, from, list }
}

describe('createAnimalPhotoList', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('liste le seul dossier du compte, avec les dates d’écriture du serveur', async () => {
    const { client, from, list } = fakeClient([
      {
        data: [stored('a.jpg', '2026-10-01T08:00:00.000Z', '2026-10-02T09:00:00.000Z')],
        error: null,
      },
    ])

    const objects = await createAnimalPhotoList(async () => client).list('user-1')

    expect(from).toHaveBeenCalledWith('animal-photos')
    expect(list).toHaveBeenCalledWith('user-1', {
      limit: ANIMAL_PHOTO_LIST_PAGE_SIZE,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    })
    expect(objects).toEqual([
      {
        name: 'a.jpg',
        createdAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-02T09:00:00.000Z',
      },
    ])
  })

  it('lit page après page jusqu’à une page incomplète', async () => {
    const full = (prefix: string) =>
      Array.from({ length: ANIMAL_PHOTO_LIST_PAGE_SIZE }, (_, index) =>
        stored(`${prefix}-${String(index).padStart(4, '0')}.jpg`),
      )
    const { client, list } = fakeClient([
      { data: full('a'), error: null },
      { data: full('b'), error: null },
      { data: [stored('c.jpg')], error: null },
    ])

    const objects = await createAnimalPhotoList(async () => client).list('user-1')

    expect(objects).toHaveLength(2 * ANIMAL_PHOTO_LIST_PAGE_SIZE + 1)
    expect(list.mock.calls.map(([, options]) => options.offset)).toEqual([
      0,
      ANIMAL_PHOTO_LIST_PAGE_SIZE,
      2 * ANIMAL_PHOTO_LIST_PAGE_SIZE,
    ])
  })

  it('écarte un sous-dossier, qui n’a ni identifiant ni date', async () => {
    const { client } = fakeClient([
      {
        data: [
          { name: 'dossier', id: null, created_at: null, updated_at: null, metadata: null },
          stored('a.jpg'),
        ],
        error: null,
      },
    ])

    const objects = await createAnimalPhotoList(async () => client).list('user-1')

    expect(objects.map(({ name }) => name)).toEqual(['a.jpg'])
  })

  it.each([
    ['un refus du serveur', new StorageApiError('refus', 400, '403', 'storage', 'AccessDenied')],
    ['un réseau coupé', new Error('fetch failed')],
  ])('rejette %s, même après une première page lue', async (_label, error) => {
    const full = Array.from({ length: ANIMAL_PHOTO_LIST_PAGE_SIZE }, (_, index) =>
      stored(`a-${index}.jpg`),
    )
    const { client } = fakeClient([
      { data: full, error: null },
      { data: null, error },
    ])

    await expect(createAnimalPhotoList(async () => client).list('user-1')).rejects.toBe(error)
  })

  it('rejette une liste sans réponse, sans attendre indéfiniment', async () => {
    vi.useFakeTimers()
    const list = vi.fn<List>(() => new Promise(() => {}))
    const client = { storage: { from: () => ({ list }) } } as unknown as SupabaseClient

    const failure = createAnimalPhotoList(async () => client)
      .list('user-1')
      .then(
        () => null,
        (cause: unknown) => cause,
      )
    await vi.advanceTimersByTimeAsync(PHOTO_LIST_TIMEOUT_MS)

    expect(await failure).toBeInstanceOf(StorageTimeoutError)
  })

  it('rejette un dossier sans fin plutôt que de boucler', async () => {
    const { client, list } = fakeClient((_path, options) => ({
      data: Array.from({ length: ANIMAL_PHOTO_LIST_PAGE_SIZE }, (_, index) =>
        stored(`p-${options.offset + index}.jpg`),
      ),
      error: null,
    }))

    await expect(createAnimalPhotoList(async () => client).list('user-1')).rejects.toThrow(
      /trop long/,
    )
    expect(list.mock.calls.length).toBeLessThanOrEqual(100)
  })
})
