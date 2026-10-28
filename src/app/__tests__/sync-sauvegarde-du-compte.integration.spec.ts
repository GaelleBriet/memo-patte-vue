// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { keptChoiceSnapshot } from '@/core/sync/__tests__/kept-choice-snapshot'
import { createLocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createAccountRestore } from '@/core/sync/service/account-restore'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createAccountBackupService } from '@/features/settings/service/account-backup.service'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'

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
  const cycle = createSyncCycle({
    db,
    outbox,
    pushes: createSyncPushRepository(deps.loadSupabaseClient),
    tables,
    userId: () => USER_ID,
    isEligible: () => true,
  })
  const restore = createAccountRestore({
    db,
    outbox,
    tables,
    userId: () => USER_ID,
    onRemindersOutdated: async () => {},
    choiceSnapshot: keptChoiceSnapshot(),
  })
  const backup = createAccountBackupService({
    outbox: () => outbox,
    tables: () => tables,
    animals: () => animals,
    restore,
    userId: () => USER_ID,
  })
  await device.register({ id: deviceId, installedAt: '2026-10-01T07:00:00.000Z' }, 'Pixel 8')
  return { db, animals, outbox, backup, restore, sync: () => cycle.runCycle() }
}

describe('le compte a-t-il une sauvegarde ?', () => {
  let server: FakeSyncServer
  let phone: Awaited<ReturnType<typeof createPhone>>
  let tablet: Awaited<ReturnType<typeof createPhone>>

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 8) })
    server = createFakeSyncServer()
    phone = await createPhone(server, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    tablet = await createPhone(server, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  })

  afterEach(() => {
    vi.useRealTimers()
    phone.db.close()
    tablet.db.close()
  })

  it('compte vide : rien ne part tant que « Envoyer » n’est pas touché', async () => {
    await phone.animals.create({ name: 'Milo', species: 'dog' })

    await expect(phone.backup.check()).resolves.toEqual({
      kind: 'confirm-send',
      animalCount: 1,
      firstName: 'Milo',
    })
    await phone.sync()

    await expect(phone.outbox.isEnabled()).resolves.toBe(false)
    await expect(phone.outbox.listPending()).resolves.toEqual([])
    expect(server.rows('animal')).toEqual([])
  })

  it('compte vide, « Envoyer » touché : le carnet du téléphone part vers le cloud', async () => {
    await phone.animals.create({ name: 'Milo', species: 'dog' })
    await phone.backup.check()

    await expect(phone.backup.confirmSend()).resolves.toEqual({ kind: 'seeded' })
    await phone.sync()

    expect(server.rows('animal').map(({ name }) => name)).toEqual(['Milo'])
  })

  it('téléphone sans animal sur un compte vide : la synchro s’active sans question', async () => {
    await expect(phone.backup.check()).resolves.toEqual({ kind: 'seeded' })

    await expect(phone.outbox.isEnabled()).resolves.toBe(true)
  })

  it('seulement des animaux supprimés sur le téléphone : aucune question, rien du carnet ne part', async () => {
    const milo = await phone.animals.create({ name: 'Milo', species: 'dog' })
    await phone.animals.remove(milo.id)

    await expect(phone.backup.check()).resolves.toEqual({ kind: 'seeded' })
    await phone.sync()

    await expect(phone.outbox.isEnabled()).resolves.toBe(true)
    expect(server.rows('animal')).toEqual([])
  })

  it('un animal visible et un supprimé : « Envoyer » n’envoie pas le supprimé', async () => {
    await phone.animals.create({ name: 'Milo', species: 'dog' })
    const luna = await phone.animals.create({ name: 'Luna', species: 'cat' })
    await phone.animals.remove(luna.id)

    await expect(phone.backup.check()).resolves.toMatchObject({
      kind: 'confirm-send',
      animalCount: 1,
    })
    await phone.backup.confirmSend()
    await phone.sync()

    expect(server.rows('animal').map(({ name }) => name)).toEqual(['Milo'])
  })

  it('app relancée pendant la question : la question revient, rien n’est parti', async () => {
    await phone.animals.create({ name: 'Milo', species: 'dog' })
    await phone.backup.check()

    await expect(phone.backup.check()).resolves.toMatchObject({ kind: 'confirm-send' })
    await phone.sync()

    expect(server.rows('animal')).toEqual([])
  })

  it('une sauvegarde apparue pendant la question : « Envoyer » ne fusionne pas en silence', async () => {
    await phone.animals.create({ name: 'Milo', species: 'dog' })
    await tablet.animals.create({ name: 'Luna', species: 'cat' })
    await phone.backup.check()
    await tablet.outbox.enableAndQueueWholeCarnet()
    await tablet.sync()

    await expect(phone.backup.confirmSend()).resolves.toMatchObject({ kind: 'backup-found' })

    await expect(phone.outbox.isEnabled()).resolves.toBe(false)
    expect(server.rows('animal').map(({ name }) => name)).toEqual(['Luna'])
  })

  it('seule la fiche d’un téléphone sur le compte : ce n’est pas une sauvegarde', async () => {
    await phone.outbox.enableAndQueueWholeCarnet()
    await phone.sync()
    expect(server.rows('device')).toHaveLength(1)

    await expect(tablet.backup.check()).resolves.toEqual({ kind: 'seeded' })
  })

  it('seulement des animaux supprimés : ce n’est pas une sauvegarde', async () => {
    const milo = await phone.animals.create({ name: 'Milo', species: 'dog' })
    await phone.animals.remove(milo.id)
    await phone.outbox.enableAndQueueWholeCarnet()
    await phone.sync()

    await expect(tablet.backup.check()).resolves.toEqual({ kind: 'seeded' })
  })

  it('avec des animaux, suivis ou non : le résumé compte tous ceux non supprimés, rien n’est activé', async () => {
    await phone.animals.create({ name: 'Milo', species: 'dog' })
    const carre = await phone.animals.create({ name: 'Carré', species: 'cat' })
    await phone.animals.setDeparture(carre.id, {
      unfollowedOn: '2026-09-02',
      departureReason: null,
      departureDate: null,
    })
    await phone.outbox.enableAndQueueWholeCarnet()
    await phone.sync()
    const latest = server
      .rows('device')
      .concat(server.rows('animal'))
      .map(({ server_updated_at }) => Date.parse(String(server_updated_at)))
      .reduce((a, b) => Math.max(a, b))
    await tablet.animals.create({ name: 'Luna', species: 'cat' })

    await expect(tablet.backup.check()).resolves.toEqual({
      kind: 'backup-found',
      summary: { animalCount: 2, lastBackupAt: new Date(latest).toISOString() },
    })
    await expect(tablet.outbox.isEnabled()).resolves.toBe(false)
    await expect(tablet.outbox.listPending()).resolves.toEqual([])
  })

  it('un téléphone sans animal reçoit la sauvegarde sans question', async () => {
    await phone.animals.create({ name: 'Milo', species: 'dog' })
    await phone.outbox.enableAndQueueWholeCarnet()
    await phone.sync()

    await expect(tablet.backup.check()).resolves.toEqual({ kind: 'restore-pending', mode: 'merge' })
    await tablet.restore.run()

    expect((await tablet.animals.list()).map(({ name }) => name)).toEqual(['Milo'])
    await expect(tablet.outbox.isEnabled()).resolves.toBe(true)
  })
})
