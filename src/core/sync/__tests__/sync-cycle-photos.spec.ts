// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import {
  PhotoUploadRefusal,
  type LocalPhotoFiles,
  type PhotoUploadPort,
} from '../service/photo-upload-port'
import { createSyncCycle } from '../service/sync-cycle'
import type { SyncPush, SyncRow, SyncableTable } from '../service/syncable-table'
import { createFakeOutbox, type FakeOutboxEntry } from './fake-sync-outbox'
import {
  ANIMAL_ID,
  createSyncTestDb,
  enableSync,
  insertAnimal,
  setAnimalPhoto,
} from './sync-test-db'

const T_QUEUED = '2026-10-22T08:00:00.000Z'
const MILO_PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const LUNA_PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

function jpeg(size = 16): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

function photoEntry(entityId: string, queuedAt = T_QUEUED): FakeOutboxEntry {
  return { entity: ANIMAL_PHOTO_ENTITY, entityId, queuedAt, attempts: 0 }
}

function fakeFiles(initial: Record<string, Uint8Array> = {}) {
  const files = new Map(Object.entries(initial))
  return {
    files,
    read: vi.fn<LocalPhotoFiles['read']>(async (name, maxBytes) => {
      const bytes = files.get(name)
      if (!bytes) return { kind: 'absent' }
      return bytes.length > maxBytes ? { kind: 'too-large' } : { kind: 'found', bytes }
    }),
  }
}

function fakeUploads(order: string[] = []) {
  const sent: Array<{ userId: string; fileName: string; jpeg: Uint8Array }> = []
  const failures = new Map<string, () => unknown>()
  const uploads: PhotoUploadPort & { sent: typeof sent; failures: typeof failures } = {
    sent,
    failures,
    async upload(userId, fileName, bytes) {
      order.push(`photo ${fileName}`)
      const failure = failures.get(fileName)
      if (failure) throw failure()
      sent.push({ userId, fileName, jpeg: bytes })
    },
  }
  return uploads
}

function animalTable(order: string[]): SyncableTable {
  const rows = new Map<string, SyncRow>([['a1', { id: 'a1', updated_at: T_QUEUED, name: 'x' }]])
  return {
    entity: 'animal',
    async getRowForPush(id) {
      return rows.get(id) ?? null
    },
    async pushRow(_userId, row) {
      order.push(`ligne ${row.id}`)
      return row
    },
    async pullPage() {
      order.push('pull')
      return { rows: [], stamps: [], cursor: null }
    },
    applyRemoteRowStatement: () => ({ sql: 'SELECT 1' }),
    replacePushedRowStatement: () => ({ sql: 'SELECT 1' }),
  }
}

const pushes = {
  async open(_userId: string, sentAt: string): Promise<SyncPush> {
    return { id: 'envoi-1', sentAt }
  },
}

describe('createSyncCycle — photos', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSyncTestDb()
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  function cycleWith(
    outbox: ReturnType<typeof createFakeOutbox>,
    files: ReturnType<typeof fakeFiles>,
    uploads: PhotoUploadPort,
    options: {
      order?: string[]
      isEligible?: boolean
      isPhotoInCarnet?: (fileName: string) => Promise<boolean>
    } = {},
  ) {
    return createSyncCycle({
      db,
      outbox,
      pushes,
      tables: [animalTable(options.order ?? [])],
      userId: () => 'user-1',
      isEligible: () => options.isEligible ?? true,
      photos: { files, uploads, isPhotoInCarnet: options.isPhotoInCarnet ?? (async () => true) },
    })
  }

  describe('photo qui n’est plus portée par un animal', () => {
    it('sort de la file sans lire ni envoyer le fichier, sans bloquer les autres photos', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO), photoEntry(LUNA_PHOTO)])
      const files = fakeFiles({ [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() })
      const uploads = fakeUploads()

      await cycleWith(outbox, files, uploads, {
        isPhotoInCarnet: async (name) => name === LUNA_PHOTO,
      }).runCycle()

      expect(files.read).not.toHaveBeenCalledWith(MILO_PHOTO, expect.anything())
      expect(uploads.sent.map(({ fileName }) => fileName)).toEqual([LUNA_PHOTO])
      expect(outbox.entries()).toEqual([])
      expect(warn).not.toHaveBeenCalled()
    })

    it('Milo : photo choisie hors ligne à 21 h, retirée à 21 h 01, réseau revenu à 21 h 01 min 30 — rien ne part', async () => {
      const outbox = createSyncOutboxRepository(db)
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, '2026-10-22T19:00:00.000Z', 'Milo', MILO_PHOTO)
      await setAnimalPhoto(db, ANIMAL_ID, null, '2026-10-22T19:01:00.000Z')
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const uploads = fakeUploads()
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-22T19:01:30.000Z') })

      try {
        await createSyncCycle({
          db,
          outbox,
          pushes,
          tables: [],
          userId: () => 'user-1',
          isEligible: () => true,
          photos: { files, uploads, isPhotoInCarnet: (name) => outbox.isPhotoInCarnet(name) },
        }).runCycle()
      } finally {
        vi.useRealTimers()
      }

      expect(uploads.sent).toEqual([])
      expect(await outbox.listPending()).not.toContainEqual(
        expect.objectContaining({ entity: ANIMAL_PHOTO_ENTITY }),
      )
    })
  })

  it('envoie la photo en file sous le nom du fichier local, puis retire son entrée', async () => {
    const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
    const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
    const uploads = fakeUploads()

    await cycleWith(outbox, files, uploads).runCycle()

    expect(uploads.sent).toEqual([{ userId: 'user-1', fileName: MILO_PHOTO, jpeg: jpeg() }])
    expect(outbox.entries()).toEqual([])
    expect(outbox.lastSyncedAt()).not.toBeNull()
  })

  it('envoie les photos après les lignes du même cycle, avant le pull', async () => {
    const order: string[] = []
    const outbox = createFakeOutbox([
      photoEntry(MILO_PHOTO),
      { entity: 'animal', entityId: 'a1', queuedAt: T_QUEUED, attempts: 0 },
    ])

    await cycleWith(outbox, fakeFiles({ [MILO_PHOTO]: jpeg() }), fakeUploads(order), {
      order,
    }).runCycle()

    expect(order).toEqual(['ligne a1', `photo ${MILO_PHOTO}`, 'pull'])
  })

  it("n'envoie rien tant que la synchronisation n'est pas activée", async () => {
    const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)], {}, false)
    const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
    const uploads = fakeUploads()

    await cycleWith(outbox, files, uploads).runCycle()

    expect(files.read).not.toHaveBeenCalled()
    expect(uploads.sent).toEqual([])
    expect(outbox.entries()).toEqual([photoEntry(MILO_PHOTO)])
  })

  it("n'envoie rien sans compte Plus actif", async () => {
    const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
    const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
    const uploads = fakeUploads()

    await cycleWith(outbox, files, uploads, { isEligible: false }).runCycle()

    expect(files.read).not.toHaveBeenCalled()
    expect(uploads.sent).toEqual([])
  })

  it('retire sans erreur l’entrée d’une photo dont le fichier a disparu du téléphone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
    const uploads = fakeUploads()

    await expect(cycleWith(outbox, fakeFiles(), uploads).runCycle()).resolves.toBeUndefined()

    expect(uploads.sent).toEqual([])
    expect(outbox.entries()).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('envoie une photo de 2 Mio pile', async () => {
    const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
    const uploads = fakeUploads()

    await cycleWith(outbox, fakeFiles({ [MILO_PHOTO]: jpeg(MAX_PHOTO_BYTES) }), uploads).runCycle()

    expect(uploads.sent).toHaveLength(1)
  })

  it.each([
    ['plus lourde que 2 Mio', jpeg(MAX_PHOTO_BYTES + 1)],
    ['qui n’est pas un JPEG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])],
    ['vide', new Uint8Array()],
  ])(
    'sort de la file, sans tenter l’envoi ni bloquer les autres, une photo %s',
    async (_label, bytes) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO), photoEntry(LUNA_PHOTO)])
      const uploads = fakeUploads()
      const files = fakeFiles({ [MILO_PHOTO]: bytes, [LUNA_PHOTO]: jpeg() })

      await expect(cycleWith(outbox, files, uploads).runCycle()).resolves.toBeUndefined()

      expect(files.read).toHaveBeenCalledWith(MILO_PHOTO, MAX_PHOTO_BYTES)
      expect(uploads.sent.map(({ fileName }) => fileName)).toEqual([LUNA_PHOTO])
      expect(outbox.entries()).toEqual([])
      expect(warn).toHaveBeenCalledOnce()
      expect(JSON.stringify(warn.mock.calls)).not.toContain(MILO_PHOTO)
    },
  )

  describe('envoi qui échoue', () => {
    const TOO_LARGE = () => new PhotoUploadRefusal('413 EntityTooLarge')

    it('sort de la file une photo refusée trois fois de la même façon, sans faire échouer le cycle', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const uploads = fakeUploads()
      uploads.failures.set(MILO_PHOTO, TOO_LARGE)
      const cycle = cycleWith(outbox, fakeFiles({ [MILO_PHOTO]: jpeg() }), uploads)

      await expect(cycle.runCycle()).rejects.toBeInstanceOf(PhotoUploadRefusal)
      await expect(cycle.runCycle()).rejects.toBeInstanceOf(PhotoUploadRefusal)
      expect(outbox.entries()).toEqual([{ ...photoEntry(MILO_PHOTO), attempts: 2 }])

      await expect(cycle.runCycle()).resolves.toBeUndefined()

      expect(outbox.entries()).toEqual([])
      expect(warn).toHaveBeenCalledOnce()
      const logged = JSON.stringify(warn.mock.calls)
      expect(logged).toContain('413 EntityTooLarge')
      expect(logged).not.toContain(MILO_PHOTO)
    })

    it('recompte depuis zéro quand la photo est remise en file entre deux refus', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const uploads = fakeUploads()
      uploads.failures.set(MILO_PHOTO, TOO_LARGE)
      const cycle = cycleWith(outbox, fakeFiles({ [MILO_PHOTO]: jpeg() }), uploads)

      await expect(cycle.runCycle()).rejects.toBeInstanceOf(PhotoUploadRefusal)
      await expect(cycle.runCycle()).rejects.toBeInstanceOf(PhotoUploadRefusal)
      const [pending] = outbox.entries()
      await outbox.removeIfUnchanged(pending!)
      const T_LATER = '2026-10-22T09:00:00.000Z'
      outbox.entries().push({ ...photoEntry(MILO_PHOTO, T_LATER), attempts: 2 })
      await expect(cycle.runCycle()).rejects.toBeInstanceOf(PhotoUploadRefusal)

      expect(outbox.entries()).toEqual([{ ...photoEntry(MILO_PHOTO, T_LATER), attempts: 3 }])
    })

    it('réessaie sans fin une panne passagère ou un refus de droit, sans les compter comme refus', async () => {
      const failures = [
        new Error('fetch failed'),
        { name: 'StorageApiError', status: 400, statusCode: '403', code: 'AccessDenied' },
        { name: 'StorageApiError', status: 503, statusCode: '503' },
      ]
      for (const failure of failures) {
        const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
        const uploads = fakeUploads()
        uploads.failures.set(MILO_PHOTO, () => failure)
        const cycle = cycleWith(outbox, fakeFiles({ [MILO_PHOTO]: jpeg() }), uploads)

        for (let attempt = 0; attempt < 4; attempt += 1) {
          await expect(cycle.runCycle()).rejects.toBe(failure)
        }

        expect(outbox.entries()).toEqual([{ ...photoEntry(MILO_PHOTO), attempts: 4 }])
      }
    })

    it('envoie les autres photos, tire quand même, puis lève pour le backoff', async () => {
      const order: string[] = []
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO), photoEntry(LUNA_PHOTO)])
      const uploads = fakeUploads(order)
      const failure = new Error('fetch failed')
      uploads.failures.set(MILO_PHOTO, () => failure)
      const files = fakeFiles({ [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() })

      await expect(cycleWith(outbox, files, uploads, { order }).runCycle()).rejects.toBe(failure)

      expect(uploads.sent.map(({ fileName }) => fileName)).toEqual([LUNA_PHOTO])
      expect(order.at(-1)).toBe('pull')
      expect(outbox.entries()).toEqual([{ ...photoEntry(MILO_PHOTO), attempts: 1 }])
      expect(outbox.lastSyncedAt()).toBeNull()
    })

    it('réessaie au cycle suivant une photo dont la lecture a échoué', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const failure = new Error('lecture impossible')
      files.read.mockRejectedValueOnce(failure)
      const uploads = fakeUploads()
      const cycle = cycleWith(outbox, files, uploads)

      await expect(cycle.runCycle()).rejects.toBe(failure)
      expect(outbox.entries()).toEqual([{ ...photoEntry(MILO_PHOTO), attempts: 1 }])

      await cycle.runCycle()
      expect(uploads.sent).toHaveLength(1)
      expect(outbox.entries()).toEqual([])
    })

    it('garde en file une photo remise en file pendant son envoi', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const uploads = fakeUploads()
      const upload = uploads.upload.bind(uploads)
      const T_LATER = '2026-10-22T09:00:00.000Z'
      uploads.upload = async (userId, fileName, bytes) => {
        await upload(userId, fileName, bytes)
        const [pending] = outbox.entries()
        await outbox.removeIfUnchanged(pending!)
        outbox.entries().push(photoEntry(MILO_PHOTO, T_LATER))
      }

      await cycleWith(outbox, fakeFiles({ [MILO_PHOTO]: jpeg() }), uploads).runCycle()

      expect(outbox.entries()).toEqual([photoEntry(MILO_PHOTO, T_LATER)])
    })
  })
})
