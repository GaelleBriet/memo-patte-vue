// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { StorageTimeoutError } from '@/core/supabase/storage-timeout'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import type { PhotoDeletePort } from '../service/photo-delete-port'
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
const DAY_MS = 24 * 60 * 60 * 1000
const GRACE_OVER = new Date(Date.parse(T_QUEUED) + 7 * DAY_MS)
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
    exists: vi.fn<LocalPhotoFiles['exists']>(async (name) => files.has(name)),
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

function fakeDeletes(order: string[] = []) {
  const deleted: Array<{ userId: string; fileName: string }> = []
  const failures = new Map<string, () => unknown>()
  const deletes: PhotoDeletePort & { deleted: typeof deleted; failures: typeof failures } = {
    deleted,
    failures,
    async delete(userId, fileName) {
      order.push(`effacement ${fileName}`)
      const failure = failures.get(fileName)
      if (failure) throw failure()
      deleted.push({ userId, fileName })
    },
  }
  return deletes
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
    vi.useRealTimers()
  })

  function cycleWith(
    outbox: ReturnType<typeof createFakeOutbox>,
    files: ReturnType<typeof fakeFiles>,
    uploads: PhotoUploadPort,
    options: {
      order?: string[]
      isEligible?: boolean
      isPhotoInCarnet?: (fileName: string) => Promise<boolean>
      isPhotoKeptByAnimal?: (fileName: string) => Promise<boolean>
      deletes?: PhotoDeletePort
      tables?: SyncableTable[]
      now?: () => Date
    } = {},
  ) {
    const isPhotoInCarnet = options.isPhotoInCarnet ?? (async () => true)
    return createSyncCycle({
      db,
      outbox,
      pushes,
      tables: options.tables ?? [animalTable(options.order ?? [])],
      userId: () => 'user-1',
      isEligible: () => options.isEligible ?? true,
      now: options.now ?? (() => GRACE_OVER),
      photos: {
        files,
        uploads,
        deletes: options.deletes ?? fakeDeletes(),
        isPhotoInCarnet,
        isPhotoKeptByAnimal: options.isPhotoKeptByAnimal ?? isPhotoInCarnet,
      },
    })
  }

  describe('photo qui n’est plus portée par un animal', () => {
    function realCycle(
      files: ReturnType<typeof fakeFiles>,
      uploads: PhotoUploadPort,
      deletes: PhotoDeletePort = fakeDeletes(),
    ) {
      const outbox = createSyncOutboxRepository(db)
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [],
        userId: () => 'user-1',
        isEligible: () => true,
        photos: {
          files,
          uploads,
          deletes,
          isPhotoInCarnet: (name) => outbox.isPhotoInCarnet(name),
          isPhotoKeptByAnimal: (name) => outbox.isPhotoKeptByAnimal(name),
        },
      })
      return { outbox, cycle }
    }

    async function queuedPhotos(outbox: ReturnType<typeof createSyncOutboxRepository>) {
      return (await outbox.listPending()).filter(({ entity }) => entity === ANIMAL_PHOTO_ENTITY)
    }

    it('reste en file, sans être lue, envoyée ni comptée, tant que son fichier existe', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO), photoEntry(LUNA_PHOTO)])
      const files = fakeFiles({ [MILO_PHOTO]: jpeg(), [LUNA_PHOTO]: jpeg() })
      const uploads = fakeUploads()

      await expect(
        cycleWith(outbox, files, uploads, {
          isPhotoInCarnet: async (name) => name === LUNA_PHOTO,
        }).runCycle(),
      ).resolves.toBeUndefined()

      expect(files.read).not.toHaveBeenCalledWith(MILO_PHOTO, expect.anything())
      expect(uploads.sent.map(({ fileName }) => fileName)).toEqual([LUNA_PHOTO])
      expect(outbox.entries()).toEqual([photoEntry(MILO_PHOTO)])
      expect(outbox.lastSyncedAt()).not.toBeNull()
    })

    it('sort de la file sans envoi une fois son fichier effacé, effacée du cloud', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const uploads = fakeUploads()
      const deletes = fakeDeletes()

      await cycleWith(outbox, fakeFiles(), uploads, {
        isPhotoInCarnet: async () => false,
        deletes,
      }).runCycle()

      expect(uploads.sent).toEqual([])
      expect(deletes.deleted).toEqual([{ userId: 'user-1', fileName: MILO_PHOTO }])
      expect(outbox.entries()).toEqual([])
      expect(warn).not.toHaveBeenCalled()
    })

    it('Milo : photo choisie hors ligne à 21 h, retirée à 21 h 01, réseau revenu à 21 h 01 min 30, fichier effacé à la fin du toast — rien n’est envoyé ni effacé avant sept jours', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-22T19:00:00.000Z') })
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, '2026-10-22T19:00:00.000Z', 'Milo', MILO_PHOTO)
      await setAnimalPhoto(db, ANIMAL_ID, null, '2026-10-22T19:01:00.000Z')
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const uploads = fakeUploads()
      const { outbox, cycle } = realCycle(files, uploads)

      vi.setSystemTime(new Date('2026-10-22T19:01:30.000Z'))
      await cycle.runCycle()
      expect(uploads.sent).toEqual([])
      expect(await queuedPhotos(outbox)).toHaveLength(1)

      files.files.delete(MILO_PHOTO)
      vi.setSystemTime(new Date('2026-10-22T19:01:35.000Z'))
      await cycle.runCycle()

      expect(uploads.sent).toEqual([])
      expect(await queuedPhotos(outbox)).toEqual([
        {
          entity: ANIMAL_PHOTO_ENTITY,
          entityId: MILO_PHOTO,
          queuedAt: '2026-10-22T19:01:00.000Z',
          attempts: 0,
        },
      ])
    })

    it('Milo : supprimé à 21 h 01, cycle à 21 h 01 min 02, rendu par « Annuler » à 21 h 01 min 04 — sa photo part au cycle suivant', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-22T19:00:00.000Z') })
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, '2026-10-22T19:00:00.000Z', 'Milo', MILO_PHOTO)
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const uploads = fakeUploads()
      const { outbox, cycle } = realCycle(files, uploads)
      const deletedAt = '2026-10-22T19:01:00.000Z'

      await db.run('UPDATE animal SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        deletedAt,
        deletedAt,
        ANIMAL_ID,
      ])
      vi.setSystemTime(new Date('2026-10-22T19:01:02.000Z'))
      await cycle.runCycle()
      await db.run('UPDATE animal SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
        '2026-10-22T19:01:04.000Z',
        ANIMAL_ID,
      ])
      vi.setSystemTime(new Date('2026-10-22T19:01:06.000Z'))
      await cycle.runCycle()

      expect(uploads.sent.map(({ fileName }) => fileName)).toEqual([MILO_PHOTO])
      expect(await queuedPhotos(outbox)).toEqual([])
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

  describe('photo à effacer du cloud', () => {
    const unused = { isPhotoInCarnet: async () => false }

    function failingAnimalTable(): SyncableTable {
      return {
        ...animalTable([]),
        async pushRow() {
          throw new Error('fetch failed')
        },
      }
    }

    it('efface après le pull une photo qu’aucune ligne du carnet ne porte et dont le fichier est effacé', async () => {
      const order: string[] = []
      const outbox = createFakeOutbox([
        photoEntry(MILO_PHOTO),
        { entity: 'animal', entityId: 'a1', queuedAt: T_QUEUED, attempts: 0 },
      ])
      const deletes = fakeDeletes(order)

      await cycleWith(outbox, fakeFiles(), fakeUploads(order), {
        ...unused,
        order,
        deletes,
      }).runCycle()

      expect(order).toEqual(['ligne a1', 'pull', `effacement ${MILO_PHOTO}`])
      expect(outbox.entries()).toEqual([])
      expect(outbox.lastSyncedAt()).not.toBeNull()
    })

    it('garde la photo dans le cloud, sans requête, tant que son fichier existe : « Annuler » peut la rendre', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const deletes = fakeDeletes()

      await cycleWith(outbox, fakeFiles({ [MILO_PHOTO]: jpeg() }), fakeUploads(), {
        ...unused,
        deletes,
      }).runCycle()

      expect(deletes.deleted).toEqual([])
      expect(outbox.entries()).toEqual([photoEntry(MILO_PHOTO)])
    })

    it('garde dans le cloud la photo d’un animal supprimé, qui peut revenir, et sort son entrée', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const deletes = fakeDeletes()

      await cycleWith(outbox, fakeFiles(), fakeUploads(), {
        ...unused,
        isPhotoKeptByAnimal: async () => true,
        deletes,
      }).runCycle()

      expect(deletes.deleted).toEqual([])
      expect(outbox.entries()).toEqual([])
    })

    it('sort aussi l’entrée de la photo d’un animal supprimé une minute après sa mise en file, sans attendre sept jours', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const deletes = fakeDeletes()

      await cycleWith(outbox, fakeFiles(), fakeUploads(), {
        ...unused,
        isPhotoKeptByAnimal: async () => true,
        deletes,
        now: () => new Date(Date.parse(T_QUEUED) + 60_000),
      }).runCycle()

      expect(deletes.deleted).toEqual([])
      expect(outbox.entries()).toEqual([])
    })

    it('n’efface jamais une photo dont la date de mise en file est illisible, et la garde en file', async () => {
      const unreadable = photoEntry(MILO_PHOTO, 'pas une date')
      const outbox = createFakeOutbox([unreadable])
      const deletes = fakeDeletes()

      await cycleWith(outbox, fakeFiles(), fakeUploads(), {
        ...unused,
        deletes,
        now: () => new Date(GRACE_OVER.getTime() + 365 * DAY_MS),
      }).runCycle()

      expect(deletes.deleted).toEqual([])
      expect(outbox.entries()).toEqual([unreadable])
    })

    it('n’efface rien tant qu’une ligne d’animal reste à envoyer : le cloud la désigne encore', async () => {
      const outbox = createFakeOutbox([
        { entity: 'animal', entityId: 'a1', queuedAt: T_QUEUED, attempts: 0 },
        photoEntry(MILO_PHOTO),
      ])
      const deletes = fakeDeletes()
      const cycle = cycleWith(outbox, fakeFiles(), fakeUploads(), {
        ...unused,
        deletes,
        tables: [failingAnimalTable()],
      })

      await expect(cycle.runCycle()).rejects.toThrow('fetch failed')

      expect(deletes.deleted).toEqual([])
      expect(outbox.entries().map(({ entity }) => entity)).toEqual(['animal', ANIMAL_PHOTO_ENTITY])
    })

    it('garde en file, sans effacer, une photo qu’une ligne tirée remet dans le carnet sans son fichier', async () => {
      const order: string[] = []
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const deletes = fakeDeletes(order)
      const carriedAfterPull = async () => order.includes('pull')

      await cycleWith(outbox, fakeFiles(), fakeUploads(order), {
        order,
        deletes,
        isPhotoInCarnet: carriedAfterPull,
        isPhotoKeptByAnimal: carriedAfterPull,
      }).runCycle()

      expect(deletes.deleted).toEqual([])
      expect(outbox.entries()).toEqual([photoEntry(MILO_PHOTO)])
    })

    it('n’efface rien sans compte Plus actif', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const deletes = fakeDeletes()

      await cycleWith(outbox, fakeFiles(), fakeUploads(), {
        ...unused,
        deletes,
        isEligible: false,
      }).runCycle()

      expect(deletes.deleted).toEqual([])
      expect(outbox.entries()).toEqual([photoEntry(MILO_PHOTO)])
    })

    it('réessaie sans fin une panne, un réseau coupé, un refus de droit ou un serveur muet, sans retenir les autres photos', async () => {
      const failures = [
        new Error('fetch failed'),
        { name: 'StorageApiError', status: 400, statusCode: '403', code: 'AccessDenied' },
        { name: 'StorageApiError', status: 503, statusCode: '503' },
        new StorageTimeoutError(30_000),
      ]
      for (const failure of failures) {
        const outbox = createFakeOutbox([photoEntry(MILO_PHOTO), photoEntry(LUNA_PHOTO)])
        const deletes = fakeDeletes()
        deletes.failures.set(MILO_PHOTO, () => failure)
        const cycle = cycleWith(outbox, fakeFiles(), fakeUploads(), { ...unused, deletes })

        for (let attempt = 0; attempt < 4; attempt += 1) {
          await expect(cycle.runCycle()).rejects.toBe(failure)
        }

        expect(deletes.deleted.map(({ fileName }) => fileName)).toEqual([LUNA_PHOTO])
        expect(outbox.entries()).toEqual([{ ...photoEntry(MILO_PHOTO), attempts: 4 }])
        expect(outbox.lastSyncedAt()).toBeNull()
      }
    })

    it('garde en file une photo remise en file pendant son effacement', async () => {
      const outbox = createFakeOutbox([photoEntry(MILO_PHOTO)])
      const deletes = fakeDeletes()
      const remove = deletes.delete.bind(deletes)
      const T_LATER = '2026-10-22T09:00:00.000Z'
      deletes.delete = async (userId, fileName) => {
        await remove(userId, fileName)
        const [pending] = outbox.entries()
        await outbox.removeIfUnchanged(pending!)
        outbox.entries().push(photoEntry(MILO_PHOTO, T_LATER))
      }

      await cycleWith(outbox, fakeFiles(), fakeUploads(), { ...unused, deletes }).runCycle()

      expect(outbox.entries()).toEqual([photoEntry(MILO_PHOTO, T_LATER)])
    })
  })

  describe('sur une vraie base, horloge du téléphone', () => {
    const NEW_PHOTO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'

    function realBaseCycle(files: ReturnType<typeof fakeFiles>, order: string[]) {
      let plusActive = true
      let now = new Date('2026-10-20T08:00:00.000Z')
      const remoteRows: SyncRow[] = []
      const outbox = createSyncOutboxRepository(db)
      const uploads = fakeUploads(order)
      const deletes = fakeDeletes(order)
      const animals: SyncableTable = {
        ...animalTable(order),
        async getRowForPush(id) {
          const [row] = await db.query<SyncRow>(
            'SELECT id, updated_at, photo_path FROM animal WHERE id = ?',
            [id],
          )
          return row ?? null
        },
        async pullPage() {
          order.push('pull')
          const rows = remoteRows.splice(0)
          const stamp = now.toISOString()
          return { rows, stamps: rows.map(() => stamp), cursor: rows.length > 0 ? stamp : null }
        },
        applyRemoteRowStatement: (row) => ({
          sql: 'UPDATE animal SET photo_path = ?, updated_at = ? WHERE id = ?',
          params: [row.photo_path ?? null, row.updated_at, row.id],
        }),
      }
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [animals],
        userId: () => 'user-1',
        isEligible: () => plusActive,
        now: () => now,
        photos: {
          files,
          uploads,
          deletes,
          isPhotoInCarnet: (name) => outbox.isPhotoInCarnet(name),
          isPhotoKeptByAnimal: (name) => outbox.isPhotoKeptByAnimal(name),
        },
      })
      return {
        cycle,
        uploads,
        deletes,
        remoteRows,
        setPlusActive: (active: boolean) => {
          plusActive = active
        },
        setNow: (instant: string) => {
          now = new Date(instant)
        },
      }
    }

    async function milo(files: ReturnType<typeof fakeFiles>, order: string[]) {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, '2026-10-20T08:00:00.000Z', 'Milo', MILO_PHOTO)
      const context = realBaseCycle(files, order)
      await context.cycle.runCycle()
      order.length = 0
      return context
    }

    const queuedPhoto = () =>
      db.query('SELECT entity_id, queued_at, attempts FROM sync_outbox WHERE entity = ?', [
        ANIMAL_PHOTO_ENTITY,
      ])

    it('Milo : photo changée le 23 octobre à 19 h — rien d’effacé à 6 j 23 h, ni compté ni redaté ; l’ancienne sort du cloud à 7 j pile', async () => {
      const order: string[] = []
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const { cycle, deletes, setNow } = await milo(files, order)
      await setAnimalPhoto(db, ANIMAL_ID, NEW_PHOTO, '2026-10-23T19:00:00.000Z')
      files.files.set(NEW_PHOTO, jpeg())
      files.files.delete(MILO_PHOTO)

      setNow('2026-10-23T19:01:00.000Z')
      await cycle.runCycle()
      setNow('2026-10-30T18:00:00.000Z')
      await cycle.runCycle()

      expect(deletes.deleted).toEqual([])
      await expect(queuedPhoto()).resolves.toEqual([
        { entity_id: MILO_PHOTO, queued_at: '2026-10-23T19:00:00.000Z', attempts: 0 },
      ])

      setNow('2026-10-30T19:00:00.000Z')
      await cycle.runCycle()

      expect(deletes.deleted).toEqual([{ userId: 'user-1', fileName: MILO_PHOTO }])
      await expect(queuedPhoto()).resolves.toEqual([])
    })

    it('Milo : photo changée le 23 octobre à 19 h, « Remplacer » le 24 — l’ancienne sort quand même du cloud le 30 à 19 h, pas avant', async () => {
      const order: string[] = []
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const { cycle, deletes, setNow } = await milo(files, order)
      await setAnimalPhoto(db, ANIMAL_ID, NEW_PHOTO, '2026-10-23T19:00:00.000Z')
      files.files.set(NEW_PHOTO, jpeg())
      files.files.delete(MILO_PHOTO)
      setNow('2026-10-23T19:01:00.000Z')
      await cycle.runCycle()

      const outbox = createSyncOutboxRepository(db)
      await outbox.startRestore('replace')
      const { before, after } = outbox.restoreStatements({ mode: 'replace', cursors: [] })
      await db.runMany([...before, ...after])
      setNow('2026-10-30T18:59:00.000Z')
      await cycle.runCycle()

      expect(deletes.deleted).toEqual([])

      setNow('2026-10-30T19:00:00.000Z')
      await cycle.runCycle()

      expect(deletes.deleted).toEqual([{ userId: 'user-1', fileName: MILO_PHOTO }])
      await expect(queuedPhoto()).resolves.toEqual([])
    })

    it('Milo, deux appareils : le téléphone change la photo le 23 octobre à 19 h, la tablette, plus récente, garde l’ancienne et arrive le 25 — jamais effacée', async () => {
      const order: string[] = []
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const { cycle, deletes, remoteRows, setNow } = await milo(files, order)
      await setAnimalPhoto(db, ANIMAL_ID, NEW_PHOTO, '2026-10-23T19:00:00.000Z')
      files.files.set(NEW_PHOTO, jpeg())
      files.files.delete(MILO_PHOTO)
      setNow('2026-10-23T19:01:00.000Z')
      await cycle.runCycle()

      setNow('2026-10-25T10:00:00.000Z')
      remoteRows.push({
        id: ANIMAL_ID,
        updated_at: '2026-10-23T19:00:30.000Z',
        photo_path: MILO_PHOTO,
      })
      await cycle.runCycle()
      setNow('2026-11-02T10:00:00.000Z')
      await cycle.runCycle()

      expect(deletes.deleted).toEqual([])
      await expect(queuedPhoto()).resolves.toEqual([])
    })

    it('Milo, trois appareils : photo du 1er septembre remise en file à l’activation du 23 octobre à 8 h, envoi raté, la tablette a mis une autre photo — l’ancienne reste dans le cloud jusqu’au 30 octobre à 8 h', async () => {
      const order: string[] = []
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      await insertAnimal(db, ANIMAL_ID, '2026-09-01T08:00:00.000Z', 'Milo', MILO_PHOTO)
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T08:00:00.000Z') })
      await createSyncOutboxRepository(db).enableAndQueueWholeCarnet()
      const { cycle, uploads, deletes, remoteRows, setNow } = realBaseCycle(files, order)
      uploads.failures.set(MILO_PHOTO, () => new Error('fetch failed'))
      remoteRows.push({
        id: ANIMAL_ID,
        updated_at: '2026-10-20T10:00:00.000Z',
        photo_path: NEW_PHOTO,
      })

      setNow('2026-10-23T08:01:00.000Z')
      await expect(cycle.runCycle()).rejects.toThrow('fetch failed')
      files.files.delete(MILO_PHOTO)
      setNow('2026-10-23T08:02:00.000Z')
      await cycle.runCycle()
      setNow('2026-10-30T07:59:00.000Z')
      await cycle.runCycle()

      expect(deletes.deleted).toEqual([])
      await expect(queuedPhoto()).resolves.toEqual([
        { entity_id: MILO_PHOTO, queued_at: '2026-10-23T08:00:00.000Z', attempts: 1 },
      ])

      setNow('2026-10-30T08:00:00.000Z')
      await cycle.runCycle()

      expect(deletes.deleted).toEqual([{ userId: 'user-1', fileName: MILO_PHOTO }])
    })

    it('Milo : Plus expiré le 1er novembre, photo changée le 5, Plus réactivé le 10 décembre — la nouvelle part, l’ancienne sort du cloud ensuite', async () => {
      const order: string[] = []
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const { cycle, uploads, deletes, setPlusActive, setNow } = await milo(files, order)
      expect(uploads.sent.map(({ fileName }) => fileName)).toEqual([MILO_PHOTO])

      setPlusActive(false)
      setNow('2026-11-05T08:00:00.000Z')
      await setAnimalPhoto(db, ANIMAL_ID, NEW_PHOTO, '2026-11-05T08:00:00.000Z')
      files.files.set(NEW_PHOTO, jpeg())
      await cycle.runCycle()
      files.files.delete(MILO_PHOTO)
      setNow('2026-11-20T08:00:00.000Z')
      await cycle.runCycle()
      expect(order).toEqual([])

      setPlusActive(true)
      setNow('2026-12-10T08:00:00.000Z')
      await cycle.runCycle()

      expect(order).toEqual([
        `ligne ${ANIMAL_ID}`,
        `photo ${NEW_PHOTO}`,
        'pull',
        `effacement ${MILO_PHOTO}`,
      ])
      expect(deletes.deleted).toEqual([{ userId: 'user-1', fileName: MILO_PHOTO }])
      await expect(db.query('SELECT entity FROM sync_outbox')).resolves.toEqual([])
    })

    it('Milo : photo retirée le 5 novembre, Plus en pause — effacée du cloud à la réactivation du 10 décembre, pas avant', async () => {
      const order: string[] = []
      const files = fakeFiles({ [MILO_PHOTO]: jpeg() })
      const { cycle, deletes, setPlusActive, setNow } = await milo(files, order)

      setPlusActive(false)
      setNow('2026-11-20T08:00:00.000Z')
      await setAnimalPhoto(db, ANIMAL_ID, null, '2026-11-05T08:00:00.000Z')
      files.files.delete(MILO_PHOTO)
      await cycle.runCycle()
      expect(deletes.deleted).toEqual([])

      setPlusActive(true)
      setNow('2026-12-10T08:00:00.000Z')
      await cycle.runCycle()

      expect(deletes.deleted).toEqual([{ userId: 'user-1', fileName: MILO_PHOTO }])
    })
  })

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

    it('réessaie sans fin une panne passagère, un refus de droit ou un serveur muet, sans les compter comme refus', async () => {
      const failures = [
        new Error('fetch failed'),
        { name: 'StorageApiError', status: 400, statusCode: '403', code: 'AccessDenied' },
        { name: 'StorageApiError', status: 503, statusCode: '503' },
        new StorageTimeoutError(60_000),
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
