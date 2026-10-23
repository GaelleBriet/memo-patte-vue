// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { applyFixtures } from '@/core/dev/fixtures'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import {
  createSyncOutboxRepository,
  SYNC_ENTITY_ORDER,
  type SyncOutboxRepository,
} from '@/core/sync/repository/sync-outbox.repository'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createBackupFactsReader } from '@/core/sync/service/backup-facts'
import { createSyncCycle, type SyncCycle } from '@/core/sync/service/sync-cycle'
import { normalizeSyncTimestamps } from '@/core/sync/service/normalize-sync-timestamps'
import type { SyncRow, SyncableTable } from '@/core/sync/service/syncable-table'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { backupStatusOf } from '@/features/settings/logic/backup-status'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'

describe('amorçage : le carnet local part en entier vers un compte vide', () => {
  let server: FakeSyncServer
  let db: InMemoryDb
  let tables: SyncableTable[]
  let outbox: SyncOutboxRepository
  let cycle: SyncCycle

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 8) })
    server = createFakeSyncServer()
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    const deps = { loadSupabaseClient: async () => server.client }
    const animals = createAnimalsRepository(db, deps)
    const vaccinations = createVaccinationsRepository(db, deps)
    const vaccinationInjections = createVaccinationInjectionsRepository(db, deps)
    const treatments = createTreatmentsRepository(db, deps)
    const treatmentPeriods = createTreatmentPeriodsRepository(db, deps)
    const treatmentDoses = createTreatmentDosesRepository(db, deps)
    const weight = createWeightRepository(db, deps)
    const device = createDeviceRepository(db, deps)
    const settings = createCarnetSettingsRepository(db, deps)
    await applyFixtures({
      token: 'maquettes-1',
      storage: { getItem: () => null, setItem: () => undefined },
      db,
      repositories: {
        animals,
        vaccinations,
        vaccinationInjections,
        treatments,
        treatmentPeriods,
        treatmentDoses,
        weight,
      },
    })
    await db.run('INSERT OR REPLACE INTO sync_state (id, enabled) VALUES (1, 0)')
    await device.register(
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', installedAt: '2026-10-01T07:00:00.000Z' },
      'Pixel 8',
    )
    await settings.update({ vaccineReminderTime: '18:30' })
    await db.run(
      `UPDATE weight_entry SET deleted_at = ?, updated_at = ?
       WHERE id = (SELECT id FROM weight_entry ORDER BY id LIMIT 1)`,
      ['2026-10-20T09:00:00.000Z', '2026-10-20T09:00:00.000Z'],
    )

    tables = [
      device,
      animals,
      vaccinations,
      vaccinationInjections,
      treatments,
      treatmentPeriods,
      treatmentDoses,
      weight,
      settings,
    ]
    outbox = createSyncOutboxRepository(db)
    cycle = createSyncCycle({
      db,
      outbox,
      pushes: createSyncPushRepository(deps.loadSupabaseClient),
      tables,
      userId: () => USER_ID,
      isEligible: () => true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  const byId = (a: SyncRow, b: SyncRow) => String(a.id).localeCompare(String(b.id))

  async function localRows(entity: string): Promise<SyncRow[]> {
    const table = tables.find((candidate) => candidate.entity === entity)!
    const ids = await db.query<{ id: string }>(`SELECT id FROM ${entity}`)
    const rows = await Promise.all(ids.map(async ({ id }) => (await table.getRowForPush(id))!))
    return rows.sort(byId)
  }

  function serverRows(entity: string): SyncRow[] {
    return server
      .rows(entity)
      .map(({ user_id: _userId, server_updated_at: _serverUpdatedAt, ...row }) =>
        normalizeSyncTimestamps(row as SyncRow),
      )
      .sort(byId)
  }

  it('ne pousse rien tant que la synchronisation n’est pas activée', async () => {
    await cycle.runCycle()

    for (const entity of SYNC_ENTITY_ORDER) expect(server.rows(entity)).toEqual([])
    expect(server.pushes()).toEqual([])
  })

  it('une fois activée, chaque ligne locale est sur le serveur, à l’identique, et la file est vide', async () => {
    await outbox.enableAndQueueWholeCarnet()

    await cycle.runCycle()

    const local = Object.fromEntries(
      await Promise.all(SYNC_ENTITY_ORDER.map(async (entity) => [entity, await localRows(entity)])),
    ) as Record<string, SyncRow[]>
    const remote = Object.fromEntries(
      SYNC_ENTITY_ORDER.map((entity) => [entity, serverRows(entity)]),
    )
    expect(SYNC_ENTITY_ORDER.filter((entity) => local[entity]!.length === 0)).toEqual([])
    expect(remote).toEqual(local)
    expect(serverRows('weight_entry').some((row) => row.deleted_at !== null)).toBe(true)
    await expect(outbox.listPending()).resolves.toEqual([])
  })

  it('un second envoi ne crée ni ne réécrit rien sur le serveur', async () => {
    await outbox.enableAndQueueWholeCarnet()
    await cycle.runCycle()
    const before = SYNC_ENTITY_ORDER.map((entity) => server.rows(entity))

    await outbox.enableAndQueueWholeCarnet()
    await cycle.runCycle()

    expect(SYNC_ENTITY_ORDER.map((entity) => server.rows(entity))).toEqual(before)
    await expect(outbox.listPending()).resolves.toEqual([])
  })

  it('Paramètres › Sauvegarde compte la première sauvegarde sur ce qui part, puis donne la dernière sauvegarde', async () => {
    const readFacts = createBackupFactsReader({
      outbox,
      isEligible: () => true,
      signInNeeded: () => false,
      isOnline: async () => true,
    })
    await outbox.enableAndQueueWholeCarnet()
    const queued = (await outbox.listPending()).length

    expect(queued).toBeGreaterThan(20)
    expect(backupStatusOf(await readFacts())).toEqual({
      kind: 'first-backup',
      done: 0,
      total: queued,
    })

    await cycle.runCycle()

    expect(backupStatusOf(await readFacts())).toEqual({
      kind: 'saved',
      at: new Date(2026, 9, 21, 8).toISOString(),
    })
  })
})
