import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createOrphanPhotosCleanup } from '../orphan-photos-cleanup'
import type { StoredPhoto } from '@/core/photos/photo-storage'
import type { AnimalVersion } from '@/features/animals/repository/animals.repository'

const NOW = new Date('2026-10-07T08:00:00.000Z').getTime()
const AN_HOUR_AGO = NOW - 3_600_000

const listPhotos = vi.fn<() => Promise<StoredPhoto[]>>()
const deletePhoto = vi.fn<(name: string) => Promise<void>>()
const listVersions = vi.fn<() => Promise<AnimalVersion[]>>()

const cleanup = createOrphanPhotosCleanup({
  listPhotos,
  deletePhoto,
  animals: () => ({ listVersions }),
})

function photo(name: string, modifiedAt = AN_HOUR_AGO): StoredPhoto {
  return { name, modifiedAt }
}

function animal(id: string, photoPath: string | null, deletedAt: string | null = null) {
  return { id, photoPath, deletedAt, updatedAt: '2026-10-01T08:00:00.000Z' }
}

function deleted(): string[] {
  return deletePhoto.mock.calls.map(([name]) => name).sort()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  listPhotos.mockReset().mockResolvedValue([])
  deletePhoto.mockReset().mockResolvedValue()
  listVersions.mockReset().mockResolvedValue([])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('photos orphelines au démarrage', () => {
  it('efface les photos sans animal et celles des animaux supprimés, garde celles des vivants', async () => {
    listPhotos.mockResolvedValue([
      photo('milo.jpg'),
      photo('orpheline.jpg'),
      photo('rex-supprime.jpg'),
      photo('luna.jpg'),
    ])
    listVersions.mockResolvedValue([
      animal('milo', 'milo.jpg'),
      animal('rex', 'rex-supprime.jpg', '2026-09-30T08:00:00.000Z'),
      animal('luna', 'luna.jpg'),
      animal('sans-photo', null),
    ])

    await cleanup()

    expect(deleted()).toEqual(['orpheline.jpg', 'rex-supprime.jpg'])
  })

  it('épargne une photo modifiée depuis moins d’une minute, dont la ligne peut encore arriver', async () => {
    listPhotos.mockResolvedValue([
      photo('ancienne.jpg', NOW - 60_001),
      photo('limite.jpg', NOW - 60_000),
      photo('recente.jpg', NOW - 5_000),
      photo('future.jpg', NOW + 5_000),
    ])

    await cleanup()

    expect(deleted()).toEqual(['ancienne.jpg'])
  })

  it('garde une photo qu’un animal supprimé partage avec un animal vivant', async () => {
    listPhotos.mockResolvedValue([photo('partagee.jpg')])
    listVersions.mockResolvedValue([
      animal('ancien', 'partagee.jpg', '2026-09-30T08:00:00.000Z'),
      animal('vivant', 'partagee.jpg'),
    ])

    await cleanup()

    expect(deletePhoto).not.toHaveBeenCalled()
  })

  it('n’efface rien quand les animaux ne se lisent pas', async () => {
    listPhotos.mockResolvedValue([photo('milo.jpg')])
    listVersions.mockRejectedValue(new Error('base fermée'))

    await expect(cleanup()).resolves.toBeUndefined()
    expect(deletePhoto).not.toHaveBeenCalled()
  })

  it('poursuit après un effacement raté, sans lever', async () => {
    listPhotos.mockResolvedValue([photo('a.jpg'), photo('b.jpg')])
    deletePhoto.mockRejectedValueOnce(new Error('occupé'))

    await expect(cleanup()).resolves.toBeUndefined()
    expect(deletePhoto).toHaveBeenCalledTimes(2)
  })

  it('ne lève pas quand le dossier ne se lit pas', async () => {
    listPhotos.mockRejectedValue(new Error('illisible'))

    await expect(cleanup()).resolves.toBeUndefined()
    expect(listVersions).not.toHaveBeenCalled()
  })
})
