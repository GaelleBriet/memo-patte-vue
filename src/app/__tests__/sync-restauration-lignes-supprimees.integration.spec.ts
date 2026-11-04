// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlParam } from '@/core/db/db-client'
import { createInMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { applyFixtures } from '@/core/dev/fixtures'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { keptChoiceSnapshot } from '@/core/sync/__tests__/kept-choice-snapshot'
import { createLocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createAccountRestore, type RestoreMode } from '@/core/sync/service/account-restore'
import { normalizeSyncTimestamps } from '@/core/sync/service/normalize-sync-timestamps'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import type { SyncRow } from '@/core/sync/service/syncable-table'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createAnimalDeletionService } from '@/features/animals/service/animal-deletion.service'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'
const PHONE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TABLET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ANIMAL_RECORDS = [
  'vaccination',
  'vaccination_injection',
  'treatment',
  'treatment_period',
  'treatment_dose',
  'weight_entry',
] as const
const MODES = [
  ['Remplacer', 'replace'],
  ['Fusionner', 'merge'],
] as const satisfies ReadonlyArray<readonly [string, RestoreMode]>

const byId = (a: SyncRow, b: SyncRow) => String(a.id).localeCompare(String(b.id))

async function createDevice(server: FakeSyncServer, deviceId: string) {
  const db = await createInMemoryDb()
  await db.execute('PRAGMA foreign_keys = ON')
  const deps = { loadSupabaseClient: async () => server.client }
  const repositories = {
    animals: createAnimalsRepository(db, deps),
    vaccinations: createVaccinationsRepository(db, deps),
    vaccinationInjections: createVaccinationInjectionsRepository(db, deps),
    treatments: createTreatmentsRepository(db, deps),
    treatmentPeriods: createTreatmentPeriodsRepository(db, deps),
    treatmentDoses: createTreatmentDosesRepository(db, deps),
    weight: createWeightRepository(db, deps),
  }
  const device = createDeviceRepository(db, deps)
  const tables = [
    device,
    repositories.animals,
    repositories.vaccinations,
    repositories.vaccinationInjections,
    repositories.treatments,
    repositories.treatmentPeriods,
    repositories.treatmentDoses,
    repositories.weight,
    createCarnetSettingsRepository(db, deps),
  ]
  const outbox = createLocalSyncOutbox(db)
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
  const animalDeletion = createAnimalDeletionService(
    () => repositories.animals,
    [
      () => repositories.vaccinations,
      () => repositories.vaccinationInjections,
      () => repositories.weight,
      () => repositories.treatments,
      () => repositories.treatmentPeriods,
      () => repositories.treatmentDoses,
    ],
    { entriesOf: async () => [], withdrawEntries: async () => {}, reschedule: async () => {} },
    { deletePhoto: async () => {} },
  )

  async function rows(entity: string, ids: readonly string[]): Promise<SyncRow[]> {
    const table = tables.find((candidate) => candidate.entity === entity)!
    const found = await Promise.all(ids.map((id) => table.getRowForPush(id)))
    return found.filter((row) => row !== null && row !== undefined).sort(byId)
  }

  async function idsOf(entity: string, where: string, params: SqlParam[]): Promise<string[]> {
    const found = await db.query<{ id: string }>(`SELECT id FROM ${entity} WHERE ${where}`, params)
    return found.map(({ id }) => id)
  }

  return {
    db,
    repositories,
    outbox,
    restore,
    animalDeletion,
    rows,
    idsOf,
    register: () =>
      device.register({ id: deviceId, installedAt: '2026-10-01T07:00:00.000Z' }, 'Pixel 8'),
    sync: () => cycle.runCycle(),
  }
}

type Device = Awaited<ReturnType<typeof createDevice>>

describe('restauration d’un compte qui a des lignes supprimées', () => {
  let server: FakeSyncServer
  let phone: Device
  let tablet: Device

  function serverRows(entity: string, ids: readonly string[]): SyncRow[] {
    return server
      .rows(entity)
      .filter(({ id }) => ids.includes(String(id)))
      .map(({ user_id: _userId, server_updated_at: _stamp, ...row }) =>
        normalizeSyncTimestamps(row as SyncRow),
      )
      .sort(byId)
  }

  async function animalId(device: Device, name: string): Promise<string> {
    const [id] = await device.idsOf('animal', 'name = ?', [name])
    return id!
  }

  async function restorePhone(mode: RestoreMode): Promise<void> {
    await phone.restore.start(mode)
    await expect(phone.restore.run()).resolves.toBe('restored')
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 8) })
    server = createFakeSyncServer()
    phone = await createDevice(server, PHONE_ID)
    await applyFixtures({
      token: 'maquettes-1',
      storage: { getItem: () => null, setItem: () => undefined },
      db: phone.db,
      repositories: phone.repositories,
    })
    await phone.register()
    await phone.outbox.enableAndQueueWholeCarnet()
    await phone.sync()
    await phone.outbox.forgetAccount()

    vi.setSystemTime(Date.now() + 60_000)
    tablet = await createDevice(server, TABLET_ID)
    await tablet.register()
    await tablet.restore.start('merge')
    await tablet.restore.run()
    vi.setSystemTime(Date.now() + 60_000)
  })

  afterEach(() => {
    vi.useRealTimers()
    phone.db.close()
    tablet.db.close()
  })

  describe.each(MODES)('« %s » sur le téléphone', (_label, mode) => {
    it('une pesée de Milo supprimée sur la tablette reste supprimée', async () => {
      const milo = await animalId(tablet, 'Milo')
      const [weighing] = await tablet.idsOf('weight_entry', 'animal_id = ? ORDER BY measured_on', [
        milo,
      ])
      await tablet.repositories.weight.remove(weighing!)
      await tablet.sync()
      const [deleted] = serverRows('weight_entry', [weighing!])
      expect(deleted?.deleted_at).not.toBeNull()
      expect(await phone.rows('weight_entry', [weighing!])).toEqual([
        expect.objectContaining({ deleted_at: null }),
      ])

      await restorePhone(mode)

      expect(await phone.rows('weight_entry', [weighing!])).toEqual([deleted])
      expect(
        (await phone.repositories.weight.listByAnimal(milo)).map(({ id }) => id),
      ).not.toContain(weighing)
    })

    it('Luna supprimée sur la tablette reste supprimée, avec tout son carnet', async () => {
      const luna = await animalId(tablet, 'Luna')
      const records = Object.fromEntries(
        await Promise.all(
          ANIMAL_RECORDS.map(
            async (entity) =>
              [entity, await tablet.idsOf(entity, 'animal_id = ?', [luna])] as const,
          ),
        ),
      )
      expect(
        ['vaccination', 'treatment', 'treatment_period', 'treatment_dose'].filter(
          (entity) => records[entity]!.length === 0,
        ),
      ).toEqual([])
      await tablet.animalDeletion.remove(luna)
      await tablet.sync()
      const [deletedLuna] = serverRows('animal', [luna])
      expect(deletedLuna?.deleted_at).not.toBeNull()
      expect((await phone.repositories.animals.list()).map(({ name }) => name).sort()).toEqual([
        'Luna',
        'Milo',
      ])

      await restorePhone(mode)

      expect(await phone.rows('animal', [luna])).toEqual([deletedLuna])
      const deleted = Object.fromEntries(
        ANIMAL_RECORDS.map((entity) => [entity, serverRows(entity, records[entity]!)]),
      )
      expect(
        Object.values(deleted)
          .flat()
          .map(({ deleted_at }) => deleted_at),
      ).not.toContain(null)
      const onPhone = Object.fromEntries(
        await Promise.all(
          ANIMAL_RECORDS.map(
            async (entity) => [entity, await phone.rows(entity, records[entity]!)] as const,
          ),
        ),
      )
      expect(onPhone).toEqual(deleted)
      expect((await phone.repositories.animals.list()).map(({ name }) => name)).toEqual(['Milo'])
    })
  })
})
