import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createOrphanPhotosCleanup } from '../orphan-photos-cleanup'
import type { AnimalVersion } from '@/features/animals/repository/animals.repository'

const listPhotos = vi.fn<() => Promise<string[]>>()
const deletePhoto = vi.fn<(name: string) => Promise<void>>()
const listVersions = vi.fn<() => Promise<AnimalVersion[]>>()

const cleanup = createOrphanPhotosCleanup({
  listPhotos,
  deletePhoto,
  animals: () => ({ listVersions }),
})

function animal(id: string, photoPath: string | null, deletedAt: string | null = null) {
  return { id, photoPath, deletedAt, updatedAt: '2026-10-01T08:00:00.000Z' }
}

beforeEach(() => {
  listPhotos.mockReset().mockResolvedValue([])
  deletePhoto.mockReset().mockResolvedValue()
  listVersions.mockReset().mockResolvedValue([])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('photos orphelines au démarrage', () => {
  it('efface les photos sans animal et celles des animaux supprimés, garde celles des vivants', async () => {
    listPhotos.mockResolvedValue(['milo.jpg', 'orpheline.jpg', 'rex-supprime.jpg', 'luna.jpg'])
    listVersions.mockResolvedValue([
      animal('milo', 'milo.jpg'),
      animal('rex', 'rex-supprime.jpg', '2026-09-30T08:00:00.000Z'),
      animal('luna', 'luna.jpg'),
      animal('sans-photo', null),
    ])

    await cleanup()

    expect(deletePhoto.mock.calls.map(([name]) => name).sort()).toEqual([
      'orpheline.jpg',
      'rex-supprime.jpg',
    ])
  })

  it('garde une photo qu’un animal supprimé partage avec un animal vivant', async () => {
    listPhotos.mockResolvedValue(['partagee.jpg'])
    listVersions.mockResolvedValue([
      animal('ancien', 'partagee.jpg', '2026-09-30T08:00:00.000Z'),
      animal('vivant', 'partagee.jpg'),
    ])

    await cleanup()

    expect(deletePhoto).not.toHaveBeenCalled()
  })

  it('lit les photos avant les animaux : une photo écrite entre-temps n’est pas dans la liste', async () => {
    const order: string[] = []
    listPhotos.mockImplementation(() => {
      order.push('photos')
      return Promise.resolve(['milo.jpg'])
    })
    listVersions.mockImplementation(() => {
      order.push('animaux')
      return Promise.resolve([animal('milo', 'milo.jpg')])
    })

    await cleanup()

    expect(order).toEqual(['photos', 'animaux'])
  })

  it('n’efface rien quand les animaux ne se lisent pas', async () => {
    listPhotos.mockResolvedValue(['milo.jpg'])
    listVersions.mockRejectedValue(new Error('base fermée'))

    await expect(cleanup()).resolves.toBeUndefined()
    expect(deletePhoto).not.toHaveBeenCalled()
  })

  it('poursuit après un effacement raté, sans lever', async () => {
    listPhotos.mockResolvedValue(['a.jpg', 'b.jpg'])
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
