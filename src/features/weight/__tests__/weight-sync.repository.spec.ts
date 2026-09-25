// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { enableSync, outboxRows } from '@/core/sync/__tests__/sync-test-db'
import { createWeightRepository, type WeightRepository } from '../repository/weight.repository'

const T_LOCAL = '2026-01-01T00:05:00.000Z'
const T_NEW = '2026-01-01T00:10:00.000Z'
const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'
const WEIGHT_ENTRY_ID = '44444444-4444-4444-8444-444444444444'

describe('weightRepository — port de synchronisation', () => {
  let db: InMemoryDb
  let repository: WeightRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    repository = createWeightRepository(db)
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES (?, 'Milo', 'dog', ?, ?)`,
      [ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
    await db.run(
      `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at)
       VALUES (?, ?, 4.2, '2026-01-01', ?, ?)`,
      [WEIGHT_ENTRY_ID, ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it('expose son entité', () => {
    expect(repository.entity).toBe('weight_entry')
  })

  it('getRowForPush renvoie la ligne même supprimée logiquement', async () => {
    await db.run('UPDATE weight_entry SET deleted_at = ? WHERE id = ?', [T_NEW, WEIGHT_ENTRY_ID])

    const row = await repository.getRowForPush(WEIGHT_ENTRY_ID)

    expect(row).toMatchObject({ id: WEIGHT_ENTRY_ID, deleted_at: T_NEW })
  })

  it("n'écrase pas une ligne locale plus récente qu'une ligne distante", async () => {
    const remote = {
      id: WEIGHT_ENTRY_ID,
      animal_id: ANIMAL_ID,
      weight_kg: 99,
      measured_on: '2025-01-01',
      created_at: T_LOCAL,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(WEIGHT_ENTRY_ID)).resolves.toMatchObject({ weightKg: 4.2 })
  })

  it('remplace la ligne locale par une version distante plus récente', async () => {
    const remote = {
      id: WEIGHT_ENTRY_ID,
      animal_id: ANIMAL_ID,
      weight_kg: 4.6,
      measured_on: '2026-02-01',
      created_at: T_LOCAL,
      updated_at: T_NEW,
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(WEIGHT_ENTRY_ID)).resolves.toMatchObject({
      weightKg: 4.6,
      measuredOn: '2026-02-01',
    })
  })

  it('une suppression distante plus récente se propage comme une modification normale', async () => {
    const remote = {
      id: WEIGHT_ENTRY_ID,
      animal_id: ANIMAL_ID,
      weight_kg: 4.2,
      measured_on: '2026-01-01',
      created_at: T_LOCAL,
      updated_at: T_NEW,
      deleted_at: T_NEW,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(WEIGHT_ENTRY_ID)).resolves.toBeNull()
  })

  it('remet en file une pesée remise par « Annuler », visible au prochain push', async () => {
    await enableSync(db)
    vi.useFakeTimers({ now: new Date('2026-01-02T09:00:00.000Z') })
    await repository.remove(WEIGHT_ENTRY_ID)
    vi.advanceTimersByTime(4_000)

    await repository.undoRemove(WEIGHT_ENTRY_ID)

    await expect(outboxRows(db)).resolves.toEqual([
      {
        entity: 'weight_entry',
        entity_id: WEIGHT_ENTRY_ID,
        queued_at: '2026-01-02T09:00:04.000Z',
        attempts: 0,
      },
    ])
    await expect(repository.getRowForPush(WEIGHT_ENTRY_ID)).resolves.toMatchObject({
      updated_at: '2026-01-02T09:00:04.000Z',
      deleted_at: null,
    })
  })
})
