// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { keptChoiceSnapshot } from '@/core/sync/__tests__/kept-choice-snapshot'
import { createCarnetPhotosRepository } from '@/core/sync/repository/carnet-photos.repository'
import { createLocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createAccountRestore } from '@/core/sync/service/account-restore'
import type { PhotoDownloadPort } from '@/core/sync/service/photo-download-port'
import { createPhotoRestore } from '@/core/sync/service/photo-restore'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'
const MILO_PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const LUNA_PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
const PIRATE_PHOTO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'
const CARRE_PHOTO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg'

function jpeg(fill: number): Uint8Array {
  const bytes = new Uint8Array(32).fill(fill)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

async function createPhone(server: FakeSyncServer, deviceId: string) {
  const db: InMemoryDb = await createInMemoryDb()
  await db.execute('PRAGMA foreign_keys = ON')
  const deps = { loadSupabaseClient: async () => server.client }
  const animals = createAnimalsRepository(db, deps)
  const device = createDeviceRepository(db, deps)
  const tables = [
    device,
    animals,
    createVaccinationsRepository(db, deps),
    createVaccinationInjectionsRepository(db, deps),
    createTreatmentsRepository(db, deps),
    createTreatmentPeriodsRepository(db, deps),
    createTreatmentDosesRepository(db, deps),
    createWeightRepository(db, deps),
    createCarnetSettingsRepository(db, deps),
  ]
  const outbox = createLocalSyncOutbox(db)
  const carnetPhotos = createCarnetPhotosRepository(db)
  const files = new Map<string, Uint8Array>()
  const requested: string[] = []
  const restore = createAccountRestore({
    db,
    outbox,
    tables,
    userId: () => USER_ID,
    onRemindersOutdated: async () => {},
    choiceSnapshot: keptChoiceSnapshot(),
  })
  const cycle = createSyncCycle({
    db,
    outbox,
    pushes: createSyncPushRepository(deps.loadSupabaseClient),
    tables,
    userId: () => USER_ID,
    isEligible: () => true,
  })

  function photosFrom(cloud: ReadonlyMap<string, Uint8Array>) {
    const downloads: PhotoDownloadPort = {
      async download(userId, fileName) {
        requested.push(fileName)
        return userId === USER_ID ? (cloud.get(fileName) ?? null) : null
      },
    }
    return createPhotoRestore({
      carnetPhotos: () => carnetPhotos.listCarnetPhotos(),
      files: {
        exists: async (name) => files.has(name),
        write: async (name, bytes) => {
          files.set(name, bytes)
        },
      },
      downloads,
      isAccountCurrent: (userId) => userId === USER_ID,
    })
  }

  async function queuedPhotos(): Promise<string[]> {
    const entries = await outbox.listPending()
    return entries
      .filter(({ entity }) => entity === ANIMAL_PHOTO_ENTITY)
      .map(({ entityId }) => entityId)
      .sort()
  }

  return {
    db,
    animals,
    outbox,
    files,
    requested,
    restore,
    photosFrom,
    queuedPhotos,
    register: () =>
      device.register({ id: deviceId, installedAt: '2026-10-01T07:00:00.000Z' }, 'Pixel 8'),
    sync: () => cycle.runCycle(),
  }
}

type Phone = Awaited<ReturnType<typeof createPhone>>

describe('photos à la restauration du carnet d’un compte', () => {
  let server: FakeSyncServer
  let phone: Phone
  let tablet: Phone
  let cloud: Map<string, Uint8Array>
  let miloId: string

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 22, 8) })
    server = createFakeSyncServer()
    phone = await createPhone(server, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    await phone.register()
    miloId = (await phone.animals.create({ name: 'Milo', species: 'dog', photoPath: MILO_PHOTO }))
      .id
    await phone.animals.create({ name: 'Luna', species: 'cat', photoPath: LUNA_PHOTO })
    const pirate = await phone.animals.create({
      name: 'Pirate',
      species: 'cat',
      photoPath: PIRATE_PHOTO,
    })
    await phone.animals.remove(pirate.id)
    await phone.outbox.enableAndQueueWholeCarnet()
    await phone.sync()
    cloud = new Map([
      [MILO_PHOTO, jpeg(1)],
      [LUNA_PHOTO, jpeg(2)],
      [PIRATE_PHOTO, jpeg(3)],
    ])
    vi.setSystemTime(new Date(2026, 9, 22, 9))
    tablet = await createPhone(server, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    await tablet.register()
  })

  afterEach(() => {
    vi.useRealTimers()
    phone.db.close()
    tablet.db.close()
  })

  it('« Remplacer » : les photos des animaux restaurés arrivent, jamais celle d’un animal supprimé, et rien ne repart en file', async () => {
    await tablet.animals.create({ name: 'Carré', species: 'dog', photoPath: CARRE_PHOTO })
    tablet.files.set(CARRE_PHOTO, jpeg(4))

    await tablet.restore.start('replace')
    await tablet.restore.run()
    await tablet.photosFrom(cloud).restoreMissing(USER_ID)

    expect(tablet.requested.sort()).toEqual([MILO_PHOTO, LUNA_PHOTO].sort())
    expect(tablet.files.get(MILO_PHOTO)).toEqual(jpeg(1))
    expect(tablet.files.get(LUNA_PHOTO)).toEqual(jpeg(2))
    expect(tablet.files.has(PIRATE_PHOTO)).toBe(false)
    await expect(tablet.queuedPhotos()).resolves.toEqual([])
  })

  it('« Fusionner » : une photo déjà sur la tablette n’est ni redemandée ni écrasée, et seules les photos de la tablette partent en file', async () => {
    await tablet.animals.create({ name: 'Carré', species: 'dog', photoPath: CARRE_PHOTO })
    tablet.files.set(CARRE_PHOTO, jpeg(4))
    tablet.files.set(MILO_PHOTO, jpeg(9))

    await tablet.restore.start('merge')
    await tablet.restore.run()
    await tablet.photosFrom(cloud).restoreMissing(USER_ID)

    expect(tablet.requested).toEqual([LUNA_PHOTO])
    expect(tablet.files.get(MILO_PHOTO)).toEqual(jpeg(9))
    expect(tablet.files.get(LUNA_PHOTO)).toEqual(jpeg(2))
    await expect(tablet.queuedPhotos()).resolves.toEqual([CARRE_PHOTO])
  })

  it('une photo absente du cloud laisse son animal sans photo ; elle arrive au lancement suivant une fois envoyée', async () => {
    cloud.delete(LUNA_PHOTO)

    await tablet.restore.start('replace')
    await tablet.restore.run()
    await tablet.photosFrom(cloud).restoreMissing(USER_ID)

    expect([...tablet.files.keys()]).toEqual([MILO_PHOTO])
    await expect(tablet.animals.list()).resolves.toContainEqual(
      expect.objectContaining({ name: 'Luna', photoPath: LUNA_PHOTO }),
    )

    cloud.set(LUNA_PHOTO, jpeg(2))
    await tablet.photosFrom(cloud).restoreMissing(USER_ID)

    expect(tablet.files.get(LUNA_PHOTO)).toEqual(jpeg(2))
    await expect(tablet.queuedPhotos()).resolves.toEqual([])
  })

  it('télécharger une photo ne touche ni au carnet ni à la file d’envoi', async () => {
    await tablet.restore.start('replace')
    await tablet.restore.run()
    const before = await tablet.outbox.listPending()

    await tablet.photosFrom(cloud).restoreMissing(USER_ID)

    await expect(tablet.outbox.listPending()).resolves.toEqual(before)
    await expect(tablet.animals.list()).resolves.toContainEqual(
      expect.objectContaining({ id: miloId, photoPath: MILO_PHOTO }),
    )
  })
})
