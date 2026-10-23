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

function holdDownloads(remote: ReturnType<typeof fakeCloud>) {
  const asked: Array<{ userId: string; fileName: string }> = []
  const waiting: Array<() => void> = []
  const flight = { now: 0, max: 0 }
  let opened = false
  const download = remote.port.download.bind(remote.port)
  remote.port.download = async (userId, fileName) => {
    asked.push({ userId, fileName })
    flight.now += 1
    flight.max = Math.max(flight.max, flight.now)
    try {
      if (!opened) await new Promise<void>((resolve) => waiting.push(resolve))
      return await download(userId, fileName)
    } finally {
      flight.now -= 1
    }
  }
  return {
    asked,
    flight,
    answerNext: () => waiting.shift()?.(),
    open: () => {
      opened = true
      waiting.splice(0).forEach((answer) => answer())
    },
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

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
  const account = { current: USER_ID as string | null }
  const restore = createPhotoRestore({
    carnetPhotos: async () => carnet,
    files,
    downloads: remote.port,
    isAccountCurrent: (userId) => account.current === userId,
    onPhotoRestored,
  })
  return { files, remote, onPhotoRestored, restore, account }
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
      isAccountCurrent: () => true,
    })

    await expect(restore.restoreMissing(USER_ID)).resolves.toBeUndefined()
  })

  it('un autre compte pendant la passe du premier : la passe s’arrête, celle du nouveau compte suit', async () => {
    const { remote, restore, account } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() },
    })
    account.current = 'user-A'
    let release!: () => void
    const slow = new Promise<void>((resolve) => {
      release = resolve
    })
    const download = remote.port.download.bind(remote.port)
    remote.port.download = async (userId, fileName) => {
      if (userId === 'user-A') {
        remote.requested.push({ userId, fileName })
        await slow
        return jpeg()
      }
      return download(userId, fileName)
    }

    const first = restore.restoreMissing('user-A')
    await vi.waitFor(() => expect(remote.requested).toHaveLength(1))
    account.current = 'user-B'
    const second = restore.restoreMissing('user-B')
    release()
    await Promise.all([first, second])

    expect(remote.requested).toEqual([
      { userId: 'user-A', fileName: MILO_PHOTO },
      { userId: 'user-B', fileName: MILO_PHOTO },
      { userId: 'user-B', fileName: LUNA_PHOTO },
    ])
  })

  it('ne demande rien pour le compte B tant que la demande en cours du compte A n’a pas répondu', async () => {
    const { remote, restore, account } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() },
    })
    const hold = holdDownloads(remote)
    account.current = 'user-A'

    const first = restore.restoreMissing('user-A')
    await vi.waitFor(() => expect(hold.asked).toHaveLength(1))
    account.current = 'user-B'
    const second = restore.restoreMissing('user-B')
    await settle()

    expect(hold.asked).toEqual([{ userId: 'user-A', fileName: MILO_PHOTO }])
    hold.answerNext()
    await vi.waitFor(() => expect(hold.asked).toHaveLength(2))
    expect(hold.asked[1]).toEqual({ userId: 'user-B', fileName: MILO_PHOTO })
    hold.open()
    await Promise.all([first, second])
  })

  it('un seul téléchargement à la fois quand les comptes A, B puis A de nouveau se suivent de près', async () => {
    const { remote, restore, account } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() },
    })
    const hold = holdDownloads(remote)
    account.current = 'user-A'

    const first = restore.restoreMissing('user-A')
    await vi.waitFor(() => expect(hold.asked).toHaveLength(1))
    account.current = 'user-B'
    const second = restore.restoreMissing('user-B')
    account.current = 'user-A'
    const third = restore.restoreMissing('user-A')
    hold.open()
    await Promise.all([first, second, third])

    expect(hold.flight.max).toBe(1)
    expect(hold.asked).toEqual([
      { userId: 'user-A', fileName: MILO_PHOTO },
      { userId: 'user-A', fileName: LUNA_PHOTO },
    ])
  })

  it('le second rappel du compte B pendant sa passe rend la même promesse, une fois la passe de A finie', async () => {
    const { remote, restore, account } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() },
    })
    const hold = holdDownloads(remote)
    account.current = 'user-A'

    const first = restore.restoreMissing('user-A')
    await vi.waitFor(() => expect(hold.asked).toHaveLength(1))
    account.current = 'user-B'
    const second = restore.restoreMissing('user-B')
    hold.answerNext()
    await first
    await vi.waitFor(() => expect(hold.asked).toHaveLength(2))
    const again = restore.restoreMissing('user-B')

    expect(again).toBe(second)
    hold.open()
    await Promise.all([second, again])
    expect(hold.flight.max).toBe(1)
  })

  it('ne lève pas quand le compte ne se vérifie pas, et la passe du compte suivant part quand même', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const remote = fakeCloud({ [MILO_PHOTO]: jpeg() })
    const restore = createPhotoRestore({
      carnetPhotos: async () => [MILO_PHOTO],
      files: fakeFiles(),
      downloads: remote.port,
      isAccountCurrent: (userId) => {
        if (userId === 'user-A') throw new Error('stockage du compte illisible')
        return true
      },
    })

    const first = restore.restoreMissing('user-A')
    const second = restore.restoreMissing('user-B')

    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(remote.requested).toEqual([{ userId: 'user-B', fileName: MILO_PHOTO }])
    expect(warn).toHaveBeenCalled()
    for (const args of warn.mock.calls) {
      expect(args.join(' ')).not.toContain(MILO_PHOTO.slice(0, 8))
    }
  })

  it('ne demande pas la photo quand le compte part pendant la recherche du fichier sur le téléphone', async () => {
    const { remote, restore, account, files } = setup({
      carnet: [MILO_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg() },
    })
    files.exists.mockImplementation(async (name) => {
      account.current = null
      return files.stored.has(name)
    })

    await restore.restoreMissing(USER_ID)

    expect(remote.requested).toEqual([])
  })

  it('ne demande plus rien quand le compte n’est plus celui de la passe, déconnexion comprise', async () => {
    const { remote, restore, account, files } = setup({
      carnet: [MILO_PHOTO, LUNA_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() },
    })
    files.write.mockImplementation(async (name, bytes) => {
      files.stored.set(name, bytes)
      account.current = null
    })

    await restore.restoreMissing(USER_ID)

    expect(remote.requested).toEqual([{ userId: USER_ID, fileName: MILO_PHOTO }])
  })

  it('n’écrit pas une photo arrivée après le départ du compte', async () => {
    const { remote, restore, account, files } = setup({
      carnet: [MILO_PHOTO],
      cloud: { [MILO_PHOTO]: jpeg() },
    })
    const download = remote.port.download.bind(remote.port)
    remote.port.download = async (userId, fileName) => {
      const bytes = await download(userId, fileName)
      account.current = null
      return bytes
    }

    await restore.restoreMissing(USER_ID)

    expect(files.write).not.toHaveBeenCalled()
  })
})
