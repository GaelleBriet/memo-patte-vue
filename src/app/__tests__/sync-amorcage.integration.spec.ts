// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { SYNC_PARENT_COLUMNS } from '@/core/db/schema-statements'
import { applyFixtures } from '@/core/dev/fixtures'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import {
  insertTreatment,
  insertTreatmentDose,
  insertTreatmentPeriod,
  insertVaccination,
  insertVaccinationInjection,
} from '@/core/sync/__tests__/sync-test-db'
import { createLocalSyncOutbox, type LocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import { SYNC_ENTITY_ORDER } from '@/core/sync/repository/sync-entity-order'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createBackupFactsReader } from '@/core/sync/service/backup-facts'
import { createSyncCycle, type SyncCycle } from '@/core/sync/service/sync-cycle'
import { normalizeSyncTimestamps } from '@/core/sync/service/normalize-sync-timestamps'
import type { SyncRow, SyncableTable } from '@/core/sync/service/syncable-table'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { backupStatusOf, refusedItemsOf } from '@/features/settings/logic/backup-status'
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
  let outbox: LocalSyncOutbox
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
    outbox = createLocalSyncOutbox(db)
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

  function backupFacts() {
    return createBackupFactsReader({
      outbox,
      isEligible: () => true,
      signInNeeded: () => false,
      sessionReset: () => false,
      isOnline: async () => true,
    })
  }

  it('Paramètres › Sauvegarde compte la première sauvegarde sur ce qui part, photos et animal non suivi compris, puis donne la dernière sauvegarde', async () => {
    const [first, second] = await db.query<{ id: string }>('SELECT id FROM animal ORDER BY id')
    await db.run("UPDATE animal SET photo_path = 'milo.jpg' WHERE id = ?", [first!.id])
    await db.run(
      "UPDATE animal SET photo_path = 'luna.jpg', unfollowed_on = '2026-10-01' WHERE id = ?",
      [second!.id],
    )
    const readFacts = backupFacts()
    await outbox.enableAndQueueWholeCarnet()
    const photos = (await outbox.listPending()).filter(({ entity }) => entity === 'animal_photo')
    expect(photos.map(({ entityId }) => entityId).sort()).toEqual(['luna.jpg', 'milo.jpg'])
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

  for (const mode of ['merge', 'replace'] as const) {
    it(`un compte B restauré (« ${mode === 'merge' ? 'Fusionner' : 'Remplacer'} ») après A ne montre jamais la dernière sauvegarde de A`, async () => {
      const readFacts = backupFacts()
      await outbox.enableAndQueueWholeCarnet()
      await cycle.runCycle()
      expect(backupStatusOf(await readFacts()).kind).toBe('saved')

      await outbox.forgetAccount()
      expect((await readFacts()).lastSyncedAt).toBeNull()
      await outbox.setLastSyncedAt('2026-10-20T18:00:00.000Z')
      await outbox.startRestore(mode)
      const { before, after } = outbox.restoreStatements({ mode, cursors: [] })
      await db.runMany([...before, ...after])

      expect(backupStatusOf(await readFacts()).kind).toBe('first-backup')
    })
  }

  it('une pesée refusée trois fois par le serveur : la sauvegarde aboutit, « Un élément » refusé, jusqu’à ce que la pesée modifiée passe', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const readFacts = backupFacts()
    const [weighing] = await db.query<{ id: string }>(
      'SELECT id FROM weight_entry WHERE deleted_at IS NULL ORDER BY id LIMIT 1',
    )
    const weight = tables.find((table) => table.entity === 'weight_entry')!
    const pushRow = weight.pushRow.bind(weight)
    let refusing = true
    weight.pushRow = async (userId, sent, push) => {
      if (refusing && sent.id === weighing!.id) {
        throw { code: '23514', message: 'new row violates check constraint "weight_entry_check"' }
      }
      return pushRow(userId, sent, push)
    }
    await outbox.enableAndQueueWholeCarnet()

    await expect(cycle.runCycle()).rejects.toMatchObject({ code: '23514' })
    await expect(cycle.runCycle()).rejects.toMatchObject({ code: '23514' })
    await cycle.runCycle()

    const refused = await readFacts()
    expect(backupStatusOf(refused).kind).toBe('saved')
    expect(refusedItemsOf(refused)).toBe(1)
    await expect(outbox.listPending()).resolves.toEqual([])

    refusing = false
    await db.run('UPDATE weight_entry SET weight_kg = 4.3, updated_at = ? WHERE id = ?', [
      new Date(2026, 9, 21, 9).toISOString(),
      weighing!.id,
    ])
    await cycle.runCycle()

    expect(refusedItemsOf(await readFacts())).toBe(0)
    expect(server.rows('weight_entry').some((row) => row.id === weighing!.id)).toBe(true)
  })
  function refuseAnimal(id: string) {
    const animals = tables.find((table) => table.entity === 'animal')!
    const pushRow = animals.pushRow.bind(animals)
    const state = { refusing: true }
    animals.pushRow = async (userId, sent, push) => {
      if (state.refusing && sent.id === id) {
        throw { code: '23514', message: 'new row violates check constraint "animal_name_check"' }
      }
      return pushRow(userId, sent, push)
    }
    return state
  }

  function recordPushOrder(): string[] {
    const order: string[] = []
    for (const table of tables) {
      const pushRow = table.pushRow.bind(table)
      table.pushRow = async (userId, sent, push) => {
        order.push(table.entity)
        return pushRow(userId, sent, push)
      }
    }
    return order
  }

  async function miloId(): Promise<string> {
    const [milo] = await db.query<{ id: string }>("SELECT id FROM animal WHERE name = 'Milo'")
    return milo!.id
  }

  async function childrenOf(animalId: string): Promise<number> {
    let total = 0
    for (const entity of Object.keys(SYNC_PARENT_COLUMNS)) {
      const [row] = await db.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM ${entity} WHERE animal_id = ?`,
        [animalId],
      )
      total += row?.total ?? 0
    }
    return total
  }

  it('Milo absent du serveur et refusé : ses fiches butent une fois sur la clé étrangère, sont refusées avec lui, puis repartent après lui', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const readFacts = backupFacts()
    const milo = await miloId()
    const miloChildren = await childrenOf(milo)
    const refusal = refuseAnimal(milo)
    await outbox.enableAndQueueWholeCarnet()

    await expect(cycle.runCycle()).rejects.toMatchObject({ code: '23514' })
    await expect(cycle.runCycle()).rejects.toMatchObject({ code: '23514' })
    await cycle.runCycle()

    const refused = await readFacts()
    expect(miloChildren).toBeGreaterThan(1)
    expect(backupStatusOf(refused).kind).toBe('saved')
    expect(refusedItemsOf(refused)).toBe(1 + miloChildren)
    await expect(outbox.listPending()).resolves.toEqual([])

    refusal.refusing = false
    const order = recordPushOrder()
    await db.run("UPDATE animal SET name = 'Milou', updated_at = ? WHERE id = ?", [
      new Date(2026, 9, 21, 9).toISOString(),
      milo,
    ])
    await cycle.runCycle()

    expect(order[0]).toBe('animal')
    expect(order).toHaveLength(1 + miloChildren)
    expect(order.map((entity) => SYNC_ENTITY_ORDER.indexOf(entity))).toEqual(
      order.map((entity) => SYNC_ENTITY_ORDER.indexOf(entity)).sort((a, b) => a - b),
    )
    expect(refusedItemsOf(await readFacts())).toBe(0)
    expect(server.rows('weight_entry').some((row) => row.animal_id === milo)).toBe(true)
  })

  it('Milo déjà sur le serveur, sa modification refusée : la pesée corrigée à 9,9 kg arrive quand même', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const milo = await miloId()
    await outbox.enableAndQueueWholeCarnet()
    await cycle.runCycle()
    const [weighing] = await db.query<{ id: string }>(
      'SELECT id FROM weight_entry WHERE animal_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1',
      [milo],
    )
    refuseAnimal(milo)
    await db.run("UPDATE animal SET name = 'Milou', updated_at = ? WHERE id = ?", [
      new Date(2026, 9, 21, 8, 10).toISOString(),
      milo,
    ])
    for (let attempt = 0; attempt < 3; attempt += 1) await cycle.runCycle().catch(() => {})

    await db.run('UPDATE weight_entry SET weight_kg = 9.9, updated_at = ? WHERE id = ?', [
      new Date(2026, 9, 21, 8, 20).toISOString(),
      weighing!.id,
    ])
    await cycle.runCycle()

    expect(server.rows('weight_entry').find((row) => row.id === weighing!.id)?.weight_kg).toBe(9.9)
    await expect(outbox.countRefused()).resolves.toBe(1)
  })

  describe('Milo sur le serveur, sa modification de 8 h 10 refusée trois fois', () => {
    const TREATMENT = '7a000000-0000-4000-8000-000000000001'
    const PERIOD = '7a000000-0000-4000-8000-000000000002'
    const DOSE = '7a000000-0000-4000-8000-000000000003'
    const VACCINE = '7a000000-0000-4000-8000-000000000004'
    const INJECTION = '7a000000-0000-4000-8000-000000000005'
    const at = (hours: number, minutes: number) =>
      new Date(2026, 9, 21, hours, minutes).toISOString()

    function failWhile(entity: string, id: string, cause: () => unknown) {
      const table = tables.find((candidate) => candidate.entity === entity)!
      const pushRow = table.pushRow.bind(table)
      table.pushRow = async (userId, sent, push) => {
        const failure = sent.id === id ? cause() : null
        if (failure) throw failure
        return pushRow(userId, sent, push)
      }
    }

    async function refuseMiloModification(): Promise<string> {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const milo = await miloId()
      await outbox.enableAndQueueWholeCarnet()
      await cycle.runCycle()
      refuseAnimal(milo)
      await db.run("UPDATE animal SET name = 'Milou', updated_at = ? WHERE id = ?", [
        at(8, 10),
        milo,
      ])
      for (let attempt = 0; attempt < 3; attempt += 1) await cycle.runCycle().catch(() => {})
      await expect(outbox.countRefused()).resolves.toBe(1)
      return milo
    }

    async function refusedIds(): Promise<string[]> {
      const rows = await db.query<{ entity_id: string }>(
        'SELECT entity_id FROM sync_outbox WHERE refused_at IS NOT NULL ORDER BY entity_id',
      )
      return rows.map(({ entity_id }) => entity_id)
    }

    async function expectCountsCoherent(): Promise<void> {
      const [row] = await db.query<{ total: number }>('SELECT COUNT(*) AS total FROM sync_outbox')
      expect((await outbox.countPending()) + (await outbox.countRefused())).toBe(row!.total)
    }

    it('la prise de 8 h 31 marquée au premier essai repart quand sa période de 8 h 30 arrive, et arrive à son tour', async () => {
      const milo = await refuseMiloModification()
      let periodDown = true
      failWhile('treatment_period', PERIOD, () =>
        periodDown ? new Error('503 Service Unavailable') : null,
      )
      await insertTreatment(db, TREATMENT, milo, at(8, 29))
      await insertTreatmentPeriod(db, PERIOD, TREATMENT, milo, at(8, 30))
      await insertTreatmentDose(db, DOSE, PERIOD, TREATMENT, milo, at(8, 31))

      await expect(cycle.runCycle()).rejects.toThrow('503')

      expect(await refusedIds()).toEqual([milo, DOSE].sort())
      await expectCountsCoherent()

      periodDown = false
      await cycle.runCycle()

      expect(server.rows('treatment_period').some((row) => row.id === PERIOD)).toBe(true)
      expect(await refusedIds()).toEqual([milo])
      expect((await outbox.listPending()).map(({ entityId }) => entityId)).toContain(DOSE)
      await expectCountsCoherent()

      await cycle.runCycle()

      expect(server.rows('treatment_dose').some((row) => row.id === DOSE)).toBe(true)
      expect(await refusedIds()).toEqual([milo])
      expect(refusedItemsOf(await backupFacts()())).toBe(1)
      await expectCountsCoherent()
    })

    it('un vaccin neuf refusé une fois puis corrigé arrive, et son injection marquée entre-temps repart avec lui', async () => {
      const milo = await refuseMiloModification()
      let vaccineRefused = true
      failWhile('vaccination', VACCINE, () =>
        vaccineRefused
          ? { code: '23514', message: 'new row violates check constraint "vaccination_check"' }
          : null,
      )
      await insertVaccination(db, VACCINE, milo, at(8, 30))
      await insertVaccinationInjection(db, INJECTION, VACCINE, milo, at(8, 31))

      await expect(cycle.runCycle()).rejects.toMatchObject({ code: '23514' })

      expect(await refusedIds()).toEqual([milo, INJECTION].sort())

      vaccineRefused = false
      await db.run('UPDATE vaccination SET updated_at = ? WHERE id = ?', [at(8, 40), VACCINE])
      await cycle.runCycle()

      expect(await refusedIds()).toEqual([milo])
      await cycle.runCycle()

      expect(server.rows('vaccination_injection').some((row) => row.id === INJECTION)).toBe(true)
      expect(await refusedIds()).toEqual([milo])
      await expectCountsCoherent()
    })
  })
})
