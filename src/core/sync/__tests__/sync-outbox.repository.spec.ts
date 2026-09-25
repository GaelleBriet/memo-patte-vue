// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createSyncOutboxRepository,
  SYNC_ENTITY_ORDER,
  type SyncOutboxRepository,
} from '../repository/sync-outbox.repository'
import {
  ANIMAL_ID,
  createSyncTestDb,
  enableSync,
  insertAnimal,
  insertTreatment,
  insertTreatmentDose,
  insertVaccination,
  insertVaccinationInjection,
  insertWeightEntry,
  touchAnimal,
} from './sync-test-db'

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-01-01T00:05:00.000Z'

describe('syncOutboxRepository', () => {
  let db: InMemoryDb
  let repository: SyncOutboxRepository

  beforeEach(async () => {
    db = await createSyncTestDb()
    repository = createSyncOutboxRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('sync_state.enabled', () => {
    it('est désactivé par défaut', async () => {
      await expect(repository.isEnabled()).resolves.toBe(false)
    })

    it('active puis désactive la synchronisation', async () => {
      await repository.setEnabled(true)
      await expect(repository.isEnabled()).resolves.toBe(true)

      await repository.setEnabled(false)
      await expect(repository.isEnabled()).resolves.toBe(false)
    })
  })

  describe('curseur de pull par entité', () => {
    it('vaut null pour une entité jamais tirée', async () => {
      await expect(repository.getLastPulledAt('animal')).resolves.toBeNull()
    })

    it('mémorise un curseur par entité, sans toucher aux autres', async () => {
      await repository.setLastPulledAt('animal', T2)
      await repository.setLastPulledAt('vaccination_injection', T1)

      await expect(repository.getLastPulledAt('animal')).resolves.toBe(T2)
      await expect(repository.getLastPulledAt('vaccination_injection')).resolves.toBe(T1)
      await expect(repository.getLastPulledAt('treatment_dose')).resolves.toBeNull()
    })

    it('remplace le curseur déjà mémorisé d’une entité', async () => {
      await repository.setLastPulledAt('animal', T1)
      await repository.setLastPulledAt('animal', T2)

      await expect(repository.getLastPulledAt('animal')).resolves.toBe(T2)
    })

    it('oublie tous les curseurs : le prochain pull repart du début, données intactes', async () => {
      await insertAnimal(db, ANIMAL_ID, T1)
      await repository.setLastPulledAt('animal', T2)
      await repository.setLastPulledAt('treatment_dose', T1)

      await repository.clearPullCursors()

      await expect(repository.getLastPulledAt('animal')).resolves.toBeNull()
      await expect(repository.getLastPulledAt('treatment_dose')).resolves.toBeNull()
      await expect(db.query('SELECT id FROM animal')).resolves.toEqual([{ id: ANIMAL_ID }])
    })
  })

  describe('restoring', () => {
    it('vaut faux par défaut', async () => {
      await expect(repository.isRestoring()).resolves.toBe(false)
    })

    it('bascule pendant une restauration puis revient à faux', async () => {
      await repository.setRestoring(true)
      await expect(repository.isRestoring()).resolves.toBe(true)

      await repository.setRestoring(false)
      await expect(repository.isRestoring()).resolves.toBe(false)
    })
  })

  describe('listPending', () => {
    it('renvoie une liste vide sans entrée', async () => {
      await expect(repository.listPending()).resolves.toEqual([])
    })

    it('rend chaque parent avant ses enfants (ordre des clés étrangères Postgres)', async () => {
      await enableSync(db)
      await insertAnimal(db, ANIMAL_ID, T1)
      await insertWeightEntry(db, 'w-1', ANIMAL_ID, T1)
      await insertTreatment(db, 't-1', ANIMAL_ID, T1)
      await insertTreatmentDose(db, 'd-1', 't-1', ANIMAL_ID, T1)
      await insertVaccination(db, 'v-1', ANIMAL_ID, T1)
      await insertVaccinationInjection(db, 'i-1', 'v-1', ANIMAL_ID, T1)

      const pending = await repository.listPending()

      expect(pending).toEqual([
        { entity: 'animal', entityId: ANIMAL_ID, queuedAt: T1, attempts: 0 },
        { entity: 'vaccination', entityId: 'v-1', queuedAt: T1, attempts: 0 },
        { entity: 'vaccination_injection', entityId: 'i-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment', entityId: 't-1', queuedAt: T1, attempts: 0 },
        { entity: 'treatment_dose', entityId: 'd-1', queuedAt: T1, attempts: 0 },
        { entity: 'weight_entry', entityId: 'w-1', queuedAt: T1, attempts: 0 },
      ])
      expect(pending.map((entry) => entry.entity)).toEqual(SYNC_ENTITY_ORDER)
    })
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
      ])
      expect(columns.find((column) => column.name === 'entity')?.pk).toBe(1)
      expect(columns.find((column) => column.name === 'entity_id')?.pk).toBe(2)
    })
  })

  describe('table sync_state', () => {
    it('porte une seule ligne, contrainte par CHECK (id = 1)', async () => {
      await expect(
        db.run('INSERT INTO sync_state (id, enabled, restoring) VALUES (2, 0, 0)'),
      ).rejects.toThrow(/CHECK constraint failed/)
    })
  })
})
