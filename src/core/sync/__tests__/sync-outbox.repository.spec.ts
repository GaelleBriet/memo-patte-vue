// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createSyncOutboxRepository,
  type SyncOutboxRepository,
} from '../repository/sync-outbox.repository'
import { SYNC_ENTITY_ORDER } from '../repository/sync-entity-order'
import {
  ANIMAL_ID,
  createSyncTestDb,
  enableSync,
  insertAnimal,
  insertCarnetSettings,
  insertTreatment,
  insertTreatmentDose,
  insertTreatmentPeriod,
  insertVaccination,
  insertVaccinationInjection,
  insertWeightEntry,
  touchAnimal,
} from './sync-test-db'

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-01-01T00:05:00.000Z'
const SETTINGS_ID = '00000000-0000-0000-0000-000000000000'

describe('syncOutboxRepository', () => {
  let db: InMemoryDb
  let repository: SyncOutboxRepository

  beforeEach(async () => {
    db = await createSyncTestDb()
    repository = createSyncOutboxRepository(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  describe('listPending', () => {
    it('renvoie une liste vide sans entrée', async () => {
      await expect(repository.listPending()).resolves.toEqual([])
    })

    it('rend chaque parent avant ses enfants (ordre des clés étrangères Postgres)', async () => {
      await enableSync(db)
      await insertCarnetSettings(db, SETTINGS_ID, T1)
      await insertAnimal(db, ANIMAL_ID, T1)
      await insertWeightEntry(db, 'w-1', ANIMAL_ID, T1)
      await insertTreatment(db, 't-1', ANIMAL_ID, T1)
      await insertTreatmentPeriod(db, 'p-1', 't-1', ANIMAL_ID, T1)
      await insertTreatmentDose(db, 'd-1', 'p-1', 't-1', ANIMAL_ID, T1)
      await insertVaccination(db, 'v-1', ANIMAL_ID, T1)
      await insertVaccinationInjection(db, 'i-1', 'v-1', ANIMAL_ID, T1)
      await db.run(
        `INSERT INTO device (id, model, installed_at, created_at, updated_at)
         VALUES ('appareil', NULL, ?, ?, ?)`,
        [T1, T1, T1],
      )

      const pending = await repository.listPending()

      expect(pending).toEqual([
        { entity: 'device', entityId: 'appareil', queuedAt: T1, attempts: 0 },
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T1, attempts: 0 },
        { entity: 'vaccination', entityId: 'v-1', queuedAt: T1, attempts: 0 },
        { entity: 'vaccination_injection', entityId: 'i-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment', entityId: 't-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment_period', entityId: 'p-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment_dose', entityId: 'd-1', queuedAt: T1, attempts: 0 },
        { entity: 'weight_entry', entityId: 'w-1', queuedAt: T1, attempts: 0 },
        { entity: 'carnet_settings', entityId: SETTINGS_ID, queuedAt: T1, attempts: 0 },
      ])
      expect(pending.map((entry) => entry.entity)).toEqual(SYNC_ENTITY_ORDER)
    })

    it('rend après toutes les autres une entité sans rang', async () => {
      await enableSync(db)
      await db.run(
        `INSERT INTO sync_outbox (entity, entity_id, queued_at) VALUES ('table_inconnue', 'x-1', ?)`,
        [T1],
      )
      await insertCarnetSettings(db, SETTINGS_ID, T2)
      await insertAnimal(db, ANIMAL_ID, T2)

      const pending = await repository.listPending()

      expect(pending.map(({ entity }) => entity)).toEqual([
        'animal',
        'carnet_settings',
        'table_inconnue',
      ])
    })
  })

  describe('queueLiveCarnetStatements', () => {
    async function insertWholeCarnet(): Promise<void> {
      await insertAnimal(db, ANIMAL_ID, T1)
      await insertVaccination(db, 'v-1', ANIMAL_ID, T1)
      await insertVaccinationInjection(db, 'i-1', 'v-1', ANIMAL_ID, T1)
      await insertTreatment(db, 't-1', ANIMAL_ID, T1)
      await insertTreatmentPeriod(db, 'p-1', 't-1', ANIMAL_ID, T1)
      await insertTreatmentDose(db, 'd-1', 'p-1', 't-1', ANIMAL_ID, T1)
      await insertWeightEntry(db, 'w-1', ANIMAL_ID, T1)
    }

    async function queuedIds(): Promise<string[]> {
      await db.runMany(repository.queueLiveCarnetStatements())
      const pending = await repository.listPending()
      return pending.map(({ entityId }) => entityId)
    }

    it('met en file chaque ligne visible du carnet', async () => {
      await insertWholeCarnet()

      await expect(queuedIds()).resolves.toEqual([
        ANIMAL_ID,
        'v-1',
        'i-1',
        't-1',
        'p-1',
        'd-1',
        'w-1',
      ])
    })

    it.each([
      { deleted: 'vaccination', id: 'v-1', expected: [ANIMAL_ID, 't-1', 'p-1', 'd-1', 'w-1'] },
      { deleted: 'treatment', id: 't-1', expected: [ANIMAL_ID, 'v-1', 'i-1', 'w-1'] },
      {
        deleted: 'treatment_period',
        id: 'p-1',
        expected: [ANIMAL_ID, 'v-1', 'i-1', 't-1', 'w-1'],
      },
    ])(
      "n'envoie aucune ligne visible sous un $deleted supprimé",
      async ({ deleted, id, expected }) => {
        await insertWholeCarnet()
        await db.run(`UPDATE ${deleted} SET deleted_at = ? WHERE id = ?`, [T2, id])

        await expect(queuedIds()).resolves.toEqual(expected)
      },
    )
  })

  describe('removeIfUnchanged', () => {
    it('supprime une entrée dont le queued_at relu est identique', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      const [entry] = await repository.listPending()

      await repository.removeIfUnchanged(entry!)

      await expect(repository.listPending()).resolves.toEqual([])
    })

    it("garde l'entrée si queued_at a changé depuis la lecture (modification arrivée pendant le push)", async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      const [staleEntry] = await repository.listPending()
      await touchAnimal(db, ANIMAL_ID, T2)

      await repository.removeIfUnchanged(staleEntry!)

      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T2, attempts: 0 },
      ])
    })

    it('ne fait rien pour une entrée déjà retirée', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      const [entry] = await repository.listPending()
      await repository.removeIfUnchanged(entry!)

      await expect(repository.removeIfUnchanged(entry!)).resolves.toBeUndefined()
    })
  })

  describe('recordFailedPush', () => {
    it("compte un essai raté sur l'entrée, qui reste en file", async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      const [entry] = await repository.listPending()

      await repository.recordFailedPush(entry!)
      await repository.recordFailedPush(entry!)

      await expect(repository.listPending()).resolves.toEqual([
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T1, attempts: 2 },
      ])
    })

    it('ne touche pas aux autres entrées', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      await insertVaccination(db, 'v-1', ANIMAL_ID, T1)
      const [animal] = await repository.listPending()

      await repository.recordFailedPush(animal!)

      const pending = await repository.listPending()
      expect(pending.map(({ entity, attempts }) => ({ entity, attempts }))).toEqual([
        { entity: 'animal', attempts: 1 },
        { entity: 'vaccination', attempts: 0 },
      ])
    })
  })

  describe('clear', () => {
    it('vide la file sans toucher aux données', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)

      await repository.clear()

      await expect(repository.listPending()).resolves.toEqual([])
      await expect(db.query('SELECT id FROM animal')).resolves.toEqual([{ id: ANIMAL_ID }])
    })
  })

  describe('table sync_outbox', () => {
    it('expose les colonnes attendues', async () => {
      const columns = await db.query<{ name: string; notnull: number; pk: number }>(
        'PRAGMA table_info(sync_outbox)',
      )
      expect(columns.map((column) => column.name)).toEqual([
        'entity',
        'entity_id',
        'queued_at',
        'attempts',
        'refused_at',
        'refused_reason',
      ])
      expect(columns.find((column) => column.name === 'entity')?.pk).toBe(1)
      expect(columns.find((column) => column.name === 'entity_id')?.pk).toBe(2)
    })
  })
})
