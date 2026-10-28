// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { photoExists, readPhoto, writeDownloadedPhoto } from '@/core/photos/photo-storage'
import { photoFileArrived } from '@/core/photos/use-photo-urls'
import { createAnimalPhotoDownload } from '@/core/supabase/animal-photo-download'
import { createAnimalPhotoList } from '@/core/supabase/animal-photo-list'
import { createCloudPhotoSweep } from '../service/cloud-photo-sweep'
import { cloudPhotoSweepMemory } from '../service/cloud-photo-sweep-memory'
import { createLocalSyncContext } from '../service/local-sync-context'
import { createPhotoRestore } from '../service/photo-restore'
import { createSyncCycle } from '../service/sync-cycle'
import { ANIMAL_ID, createSyncTestDb, insertAnimal } from './sync-test-db'

const testDb = vi.hoisted(() => ({ current: null as InMemoryDb | null }))

vi.mock('@/core/db/sqlite', () => ({ getDb: async () => testDb.current }))
vi.mock('../service/photo-restore', async (importOriginal) => {
  const original = await importOriginal<{ createPhotoRestore: typeof createPhotoRestore }>()
  return {
    ...original,
    createPhotoRestore: vi.fn<typeof createPhotoRestore>(original.createPhotoRestore),
  }
})
vi.mock('@/core/supabase/animal-photo-download', () => ({
  createAnimalPhotoDownload: vi.fn<typeof createAnimalPhotoDownload>(() => ({
    download: async () => null,
  })),
}))
vi.mock('../service/cloud-photo-sweep', async (importOriginal) => {
  const original = await importOriginal<{ createCloudPhotoSweep: typeof createCloudPhotoSweep }>()
  return {
    ...original,
    createCloudPhotoSweep: vi.fn<typeof createCloudPhotoSweep>(original.createCloudPhotoSweep),
  }
})
vi.mock('@/core/supabase/animal-photo-list', () => ({
  createAnimalPhotoList: vi.fn<typeof createAnimalPhotoList>(() => ({ list: async () => [] })),
}))
vi.mock('../service/sync-cycle', async (importOriginal) => {
  const original = await importOriginal<{ createSyncCycle: typeof createSyncCycle }>()
  return { ...original, createSyncCycle: vi.fn<typeof createSyncCycle>(original.createSyncCycle) }
})

const session = { active: true }
const cloudAnimals = {
  pullPage: async () => ({ rows: [], stamps: [], cursor: null }),
}
const MILO_PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const LUNA_PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'

describe('createLocalSyncContext', () => {
  beforeEach(() => {
    session.active = true
  })

  it('donne au cycle les fichiers du téléphone et la file pour savoir si une photo est au carnet', async () => {
    testDb.current = await createSyncTestDb()
    await insertAnimal(testDb.current, ANIMAL_ID, '2026-10-22T19:00:00.000Z', 'Milo', MILO_PHOTO)

    await createLocalSyncContext({
      tables: [],
      cloudAnimals,
      userId: () => 'user-1',
      sessionActive: () => session.active,
      isEligible: () => true,
      onRemindersOutdated: async () => {},
    })

    const [deps] = vi.mocked(createSyncCycle).mock.calls[0] ?? []
    expect(deps?.photos?.files).toEqual({ read: readPhoto, exists: photoExists })
    await expect(deps?.photos?.isPhotoInCarnet(MILO_PHOTO)).resolves.toBe(true)
    await expect(deps?.photos?.isPhotoInCarnet(LUNA_PHOTO)).resolves.toBe(false)
    testDb.current.close()
  })

  it('donne au téléchargement des photos les photos du carnet et l’écriture dans files/photos/', async () => {
    testDb.current = await createSyncTestDb()
    await insertAnimal(testDb.current, ANIMAL_ID, '2026-10-22T19:00:00.000Z', 'Milo', MILO_PHOTO)

    const context = await createLocalSyncContext({
      tables: [],
      cloudAnimals,
      userId: () => 'user-1',
      sessionActive: () => session.active,
      isEligible: () => true,
      onRemindersOutdated: async () => {},
    })

    const [deps] = vi.mocked(createPhotoRestore).mock.calls[0] ?? []
    expect(deps?.files).toEqual({ exists: photoExists, write: writeDownloadedPhoto })
    expect(deps?.onPhotoRestored).toBe(photoFileArrived)
    expect(deps?.downloads).toBe(vi.mocked(createAnimalPhotoDownload).mock.results[0]?.value)
    await expect(deps?.carnetPhotos()).resolves.toEqual([MILO_PHOTO])
    expect(deps?.isAccountCurrent('user-1')).toBe(true)
    expect(deps?.isAccountCurrent('user-2')).toBe(false)
    session.active = false
    expect(deps?.isAccountCurrent('user-1')).toBe(false)
    expect(context.photoRestore).toBe(vi.mocked(createPhotoRestore).mock.results[0]?.value)
    testDb.current.close()
  })

  it('donne au ménage du cloud les fiches du téléphone supprimées comprises, la file et le compte', async () => {
    testDb.current = await createSyncTestDb()
    await insertAnimal(testDb.current, ANIMAL_ID, '2026-10-22T19:00:00.000Z', 'Milo', MILO_PHOTO)
    await insertAnimal(testDb.current, 'parti', '2026-10-22T19:00:00.000Z', 'Luna', LUNA_PHOTO)
    await testDb.current.run("UPDATE animal SET deleted_at = updated_at WHERE id = 'parti'")
    let eligible = true

    const context = await createLocalSyncContext({
      tables: [],
      cloudAnimals,
      userId: () => 'user-1',
      sessionActive: () => session.active,
      isEligible: () => eligible,
      onRemindersOutdated: async () => {},
    })

    const [deps] = vi.mocked(createCloudPhotoSweep).mock.calls[0] ?? []
    expect(deps?.cloudAnimals).toBe(cloudAnimals)
    expect(deps?.objects).toBe(vi.mocked(createAnimalPhotoList).mock.results[0]?.value)
    expect(deps?.lastSweep).toBe(cloudPhotoSweepMemory)
    expect(deps?.outbox).toBe(context.outbox)
    await expect(deps?.localKeptPhotos().then((names) => [...names].sort())).resolves.toEqual(
      [MILO_PHOTO, LUNA_PHOTO].sort(),
    )
    expect(deps?.isEligible()).toBe(true)
    eligible = false
    expect(deps?.isEligible()).toBe(false)
    expect(deps?.isAccountCurrent('user-1')).toBe(true)
    expect(deps?.isAccountCurrent('user-2')).toBe(false)
    session.active = false
    expect(deps?.isAccountCurrent('user-1')).toBe(false)
    expect(context.photoSweep).toBe(vi.mocked(createCloudPhotoSweep).mock.results[0]?.value)
    testDb.current.close()
  })
})
