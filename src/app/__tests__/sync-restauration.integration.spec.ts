// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { applyFixtures } from '@/core/dev/fixtures'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import {
  createSyncOutboxRepository,
  SYNC_ENTITY_ORDER,
} from '@/core/sync/repository/sync-outbox.repository'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { normalizeSyncTimestamps } from '@/core/sync/service/normalize-sync-timestamps'
import type { SyncRow, SyncableTable } from '@/core/sync/service/syncable-table'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'
const CARNET_ENTITIES = SYNC_ENTITY_ORDER.filter((entity) => entity !== 'device')

async function createPhone(server: FakeSyncServer, deviceId: string) {
  const db: InMemoryDb = await createInMemoryDb()
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
  const settings = createCarnetSettingsRepository(db, deps)
  const tables: SyncableTable[] = [
    device,
    repositories.animals,
    repositories.vaccinations,
    repositories.vaccinationInjections,
    repositories.treatments,
    repositories.treatmentPeriods,
    repositories.treatmentDoses,
    repositories.weight,
    settings,
  ]
  const outbox = createSyncOutboxRepository(db)
  const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

  /** Un cycle neuf sur la même base, comme après un redémarrage de l'app. */
  function launch() {
    return createSyncCycle({
      db,
      outbox,
      pushes: createSyncPushRepository(deps.loadSupabaseClient),
      tables,
      userId: () => USER_ID,
      isEligible: () => true,
      onRemindersOutdated,
    })
  }

  async function rows(entity: string): Promise<SyncRow[]> {
    const table = tables.find((candidate) => candidate.entity === entity)!
    const ids = await db.query<{ id: string }>(`SELECT id FROM ${entity}`)
    const found = await Promise.all(ids.map(async ({ id }) => (await table.getRowForPush(id))!))
    return found.sort(byId)
  }

  return {
    db,
    repositories,
    settings,
    outbox,
    onRemindersOutdated,
    launch,
    rows,
    register: () =>
      device.register({ id: deviceId, installedAt: '2026-10-01T07:00:00.000Z' }, 'Pixel 8'),
    sync: () => launch().runCycle(),
  }
}

type Phone = Awaited<ReturnType<typeof createPhone>>

function byId(a: SyncRow, b: SyncRow): number {
  return String(a.id).localeCompare(String(b.id))
}

function later(minutes = 1): void {
  vi.setSystemTime(Date.now() + minutes * 60_000)
}

describe('restauration du carnet d’un compte', () => {
  let server: FakeSyncServer
  let phone: Phone
  let tablet: Phone

  function serverRows(entity: string): SyncRow[] {
    return server
      .rows(entity)
      .map(({ user_id: _userId, server_updated_at: _serverUpdatedAt, ...row }) =>
        normalizeSyncTimestamps(row as SyncRow),
      )
      .sort(byId)
  }

  async function expectSameCarnetAsServer(device: Phone): Promise<void> {
    for (const entity of CARNET_ENTITIES) {
      expect({ entity, rows: await device.rows(entity) }).toEqual({
        entity,
        rows: serverRows(entity),
      })
    }
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 8) })
    server = createFakeSyncServer()
    phone = await createPhone(server, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    await applyFixtures({
      token: 'maquettes-1',
      storage: { getItem: () => null, setItem: () => undefined },
      db: phone.db,
      repositories: phone.repositories,
    })
    await phone.register()
    await phone.settings.update({ vaccineReminderTime: '18:30' })
    await phone.outbox.enableAndQueueWholeCarnet()
    await phone.sync()
    later()
    tablet = await createPhone(server, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    await tablet.register()
  })

  afterEach(() => {
    vi.useRealTimers()
    phone.db.close()
    tablet.db.close()
  })

  it('sur un appareil sans carnet, tout le carnet du compte revient, et les rappels se reconstruisent', async () => {
    expect(CARNET_ENTITIES.filter((entity) => serverRows(entity).length === 0)).toEqual([])

    await tablet.outbox.enableAndQueueWholeCarnet()
    await tablet.sync()

    await expectSameCarnetAsServer(tablet)
    expect((await tablet.rows('device')).map(({ id }) => id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ])
    expect(tablet.onRemindersOutdated).toHaveBeenCalledOnce()
    await expect(tablet.outbox.listPending()).resolves.toEqual([])
  })

  it('tire tout le compte même si l’appareil avait déjà avancé ses curseurs sur un autre compte', async () => {
    for (const entity of SYNC_ENTITY_ORDER) {
      await tablet.outbox.setLastPulledAt(entity, '2099-01-01T00:00:00.000Z')
    }

    await tablet.outbox.enableAndQueueWholeCarnet()
    await tablet.sync()

    await expectSameCarnetAsServer(tablet)
  })

  it('coupée par le réseau, la restauration reprend où elle s’était arrêtée, même après un redémarrage', async () => {
    server.cutPull('treatment_dose')
    await tablet.outbox.enableAndQueueWholeCarnet()

    await expect(tablet.sync()).rejects.toBeDefined()

    expect(await tablet.rows('animal')).toEqual(serverRows('animal'))
    expect(await tablet.rows('treatment_dose')).toEqual([])
    const resumed = tablet.launch()
    await resumed.runCycle()

    await expectSameCarnetAsServer(tablet)
  })

  it('« Fusionner » garde le carnet de l’appareil et lui ajoute celui du compte, dans les deux sens', async () => {
    const luna = await tablet.repositories.animals.create({ name: 'Luna', species: 'cat' })

    await tablet.outbox.enableAndQueueWholeCarnet()
    await tablet.sync()
    await phone.sync()

    await expectSameCarnetAsServer(tablet)
    await expectSameCarnetAsServer(phone)
    expect(serverRows('animal').map(({ id }) => id)).toContain(luna.id)
  })

  it('« Fusionner » : pour les réglages du carnet, la modification la plus récente gagne', async () => {
    await tablet.settings.update({ vaccineReminderTime: '07:45' })

    await tablet.outbox.enableAndQueueWholeCarnet()
    await tablet.sync()
    await phone.sync()

    await expect(phone.settings.get()).resolves.toMatchObject({ vaccineReminderTime: '07:45' })
    await expect(tablet.settings.get()).resolves.toMatchObject({ vaccineReminderTime: '07:45' })
  })

  it('« Fusionner » : des réglages plus anciens sur l’appareil cèdent devant ceux du compte', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 8))
    await tablet.settings.update({ vaccineReminderTime: '07:45' })
    vi.setSystemTime(new Date(2026, 9, 21, 9))

    await tablet.outbox.enableAndQueueWholeCarnet()
    await tablet.sync()

    await expect(tablet.settings.get()).resolves.toMatchObject({ vaccineReminderTime: '18:30' })
    expect(serverRows('carnet_settings')).toEqual(await tablet.rows('carnet_settings'))
  })
})
