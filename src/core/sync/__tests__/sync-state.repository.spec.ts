// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createSyncStateRepository,
  type SyncStateRepository,
} from '../repository/sync-state.repository'
import { ANIMAL_ID, createSyncTestDb, insertAnimal } from './sync-test-db'

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-01-01T00:05:00.000Z'

describe('syncStateRepository', () => {
  let db: InMemoryDb
  let repository: SyncStateRepository

  beforeEach(async () => {
    db = await createSyncTestDb()
    repository = createSyncStateRepository(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
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

  describe('dernière synchronisation réussie', () => {
    it('vaut null tant qu’aucune synchronisation n’a abouti', async () => {
      await expect(repository.getLastSyncedAt()).resolves.toBeNull()
    })

    it('mémorise la date de la dernière synchronisation réussie', async () => {
      await repository.setLastSyncedAt(T1)
      await repository.setLastSyncedAt(T2)

      await expect(repository.getLastSyncedAt()).resolves.toBe(T2)
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
