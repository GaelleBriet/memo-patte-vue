// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { photoExists, readPhoto } from '@/core/photos/photo-storage'
import { createLocalSyncContext } from '../service/local-sync-context'
import { createSyncCycle } from '../service/sync-cycle'
import { ANIMAL_ID, createSyncTestDb, insertAnimal } from './sync-test-db'

const testDb = vi.hoisted(() => ({ current: null as InMemoryDb | null }))

vi.mock('@/core/db/sqlite', () => ({ getDb: async () => testDb.current }))
vi.mock('../service/sync-cycle', async (importOriginal) => {
  const original = await importOriginal<{ createSyncCycle: typeof createSyncCycle }>()
  return { ...original, createSyncCycle: vi.fn<typeof createSyncCycle>(original.createSyncCycle) }
})

const MILO_PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const LUNA_PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'

describe('createLocalSyncContext', () => {
  it('donne au cycle les fichiers du téléphone et la file pour savoir si une photo est au carnet', async () => {
    testDb.current = await createSyncTestDb()
    await insertAnimal(testDb.current, ANIMAL_ID, '2026-10-22T19:00:00.000Z', 'Milo', MILO_PHOTO)

    await createLocalSyncContext({
      tables: [],
      userId: () => 'user-1',
      isEligible: () => true,
      onRemindersOutdated: async () => {},
    })

    const [deps] = vi.mocked(createSyncCycle).mock.calls[0] ?? []
    expect(deps?.photos?.files).toEqual({ read: readPhoto, exists: photoExists })
    await expect(deps?.photos?.isPhotoInCarnet(MILO_PHOTO)).resolves.toBe(true)
    await expect(deps?.photos?.isPhotoInCarnet(LUNA_PHOTO)).resolves.toBe(false)
    testDb.current.close()
  })
})
