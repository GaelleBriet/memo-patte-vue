// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAX_CLOUD_PHOTO_BYTES } from '../service/cloud-photo'
import type { DownloadedPhotoFiles, PhotoDownloadPort } from '../service/photo-download-port'
import { createPhotoRestore } from '../service/photo-restore'

const USER_ID = 'user-1'
const MILO_PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const LUNA_PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
const CARRE_PHOTO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'

function jpeg(size = 16, fill = 0): Uint8Array {
  const bytes = new Uint8Array(size).fill(fill)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

function fakeFiles(initial: Record<string, Uint8Array> = {}) {
  const stored = new Map(Object.entries(initial))
  return {
    stored,
    exists: vi.fn<DownloadedPhotoFiles['exists']>(async (name) => stored.has(name)),
    write: vi.fn<DownloadedPhotoFiles['write']>(async (name, bytes) => {
      stored.set(name, bytes)
    }),
  }
}

function fakeCloud(objects: Record<string, Uint8Array> = {}) {
  const failures = new Map<string, () => unknown>()
  const requested: Array<{ userId: string; fileName: string }> = []
  const port: PhotoDownloadPort = {
    async download(userId, fileName) {
      requested.push({ userId, fileName })
      const failure = failures.get(fileName)
      if (failure) throw failure()
      return objects[fileName] ?? null
    },
  }
  return { port, failures, requested }
}

function setup({
  carnet,
  local = {},
  cloud = {},
}: {
  carnet: string[]
  local?: Record<string, Uint8Array>
  cloud?: Record<string, Uint8Array>
}) {
  const files = fakeFiles(local)
  const remote = fakeCloud(cloud)
  const onPhotoRestored = vi.fn<(fileName: string) => void>()
  const restore = createPhotoRestore({
    carnetPhotos: async () => carnet,
    files,
    downloads: remote.port,
    onPhotoRestored,
  })
  return { files, remote, onPhotoRestored, restore }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createPhotoRestore', () => {
  it('télécharge du dossier du compte chaque photo du carnet absente du téléphone, sous son nom', async () => {
    const milo = jpeg(16, 1)
    const luna = jpeg(32, 2)
    const { files, remote, onPhotoRestored, restore } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO],
      cloud: { [MILO_PHOTO]: milo, [LUNA_PHOTO]: luna },
    })

    await restore.restoreMissing(USER_ID)

    expect(remote.requested).toEqual([
      { userId: USER_ID, fileName: MILO_PHOTO },
      { userId: USER_ID, fileName: LUNA_PHOTO },
    ])
    expect(files.stored).toEqual(
      new Map([
        [MILO_PHOTO, milo],
        [LUNA_PHOTO, luna],
      ]),
    )
    expect(onPhotoRestored.mock.calls).toEqual([[MILO_PHOTO], [LUNA_PHOTO]])
  })

  it('ne demande ni n’écrase une photo déjà sur le téléphone', async () => {
    const local = jpeg(16, 7)
    const { files, remote, restore } = setup({
      carnet: [MILO_PHOTO],
      local: { [MILO_PHOTO]: local },
      cloud: { [MILO_PHOTO]: jpeg(16, 9) },
    })

    await restore.restoreMissing(USER_ID)

    expect(remote.requested).toEqual([])
    expect(files.write).not.toHaveBeenCalled()
    expect(files.stored.get(MILO_PHOTO)).toBe(local)
  })

  it('laisse sans photo, sans erreur, un animal dont la photo manque au cloud', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { files, onPhotoRestored, restore } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO],
      cloud: { [LUNA_PHOTO]: jpeg() },
    })

    await expect(restore.restoreMissing(USER_ID)).resolves.toBeUndefined()

    expect([...files.stored.keys()]).toEqual([LUNA_PHOTO])
    expect(onPhotoRestored.mock.calls).toEqual([[LUNA_PHOTO]])
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['un réseau coupé', () => new Error('fetch failed')],
    ['une panne du serveur', () => ({ name: 'StorageApiError', status: 503 })],
    ['un refus de droit', () => ({ name: 'StorageApiError', status: 403 })],
  ])(
    'une photo en échec (%s) ne retient pas les autres et se retente à l’appel suivant',
    async (_label, failure) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { files, remote, restore } = setup({
        carnet: [MILO_PHOTO, LUNA_PHOTO],
        cloud: { [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() },
      })
      remote.failures.set(MILO_PHOTO, failure)

      await expect(restore.restoreMissing(USER_ID)).resolves.toBeUndefined()
      expect([...files.stored.keys()]).toEqual([LUNA_PHOTO])

      remote.failures.clear()
      remote.requested.length = 0
      await restore.restoreMissing(USER_ID)

      expect(remote.requested).toEqual([{ userId: USER_ID, fileName: MILO_PHOTO }])
      expect([...files.stored.keys()].sort()).toEqual([MILO_PHOTO, LUNA_PHOTO].sort())
      for (const args of warn.mock.calls) {
        expect(args.join(' ')).not.toContain(MILO_PHOTO.slice(0, 8))
      }
    },
  )

  it('une écriture ratée ne retient pas les autres photos', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { files, onPhotoRestored, restore } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() },
    })
    files.write.mockRejectedValueOnce(new Error('disque plein'))

    await restore.restoreMissing(USER_ID)

    expect([...files.stored.keys()]).toEqual([LUNA_PHOTO])
    expect(onPhotoRestored.mock.calls).toEqual([[LUNA_PHOTO]])
  })

  it('accepte une photo de 2 Mio pile, n’écrit ni une photo plus lourde ni un fichier hors JPEG', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { files, restore } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO, CARRE_PHOTO],
      cloud: {
        [MILO_PHOTO]: jpeg(MAX_CLOUD_PHOTO_BYTES),
        [LUNA_PHOTO]: jpeg(MAX_CLOUD_PHOTO_BYTES + 1),
        [CARRE_PHOTO]: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      },
    })

    await restore.restoreMissing(USER_ID)

    expect([...files.stored.keys()]).toEqual([MILO_PHOTO])
  })

  it('ne demande jamais un nom qui n’est pas un nom de photo de l’app', async () => {
    const { remote, files, restore } = setup({
      carnet: ['../base.jpg', 'dossier/photo.jpg', 'photo.png', 'photo.jpg.part', ''],
    })

    await restore.restoreMissing(USER_ID)

    expect(remote.requested).toEqual([])
    expect(files.exists).not.toHaveBeenCalled()
  })

  it('un seul téléchargement à la fois : deux appels rapprochés ne demandent chaque photo qu’une fois', async () => {
    const { remote, restore } = setup({
      carnet: [MILO_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg() },
    })

    await Promise.all([restore.restoreMissing(USER_ID), restore.restoreMissing(USER_ID)])

    expect(remote.requested).toHaveLength(1)
  })

  it('ne lève pas quand le carnet ne se lit pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const restore = createPhotoRestore({
      carnetPhotos: async () => {
        throw new Error('base fermée')
      },
      files: fakeFiles(),
      downloads: fakeCloud().port,
    })

    await expect(restore.restoreMissing(USER_ID)).resolves.toBeUndefined()
  })
})
