// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  ANIMAL_ID,
  createSyncTestDb,
  enableSync,
  insertAnimal,
  insertTreatment,
  insertVaccination,
  insertWeightEntry,
  outboxRows,
  touchAnimal,
  touchTreatment,
  touchVaccination,
  touchWeightEntry,
} from './sync-test-db'

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-01-01T00:05:00.000Z'
const T3 = '2026-01-01T00:10:00.000Z'

describe('sync_state', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSyncTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('crée la ligne singleton désactivée par défaut', async () => {
    const rows = await db.query<{
      id: number
      enabled: number
      last_pulled_at: string | null
      restoring: number
    }>('SELECT id, enabled, last_pulled_at, restoring FROM sync_state')

    expect(rows).toEqual([{ id: 1, enabled: 0, last_pulled_at: null, restoring: 0 }])
  })
})

describe('déclencheurs sync_outbox', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSyncTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it("n'alimente rien tant que la synchronisation est désactivée", async () => {
    await insertAnimal(db, ANIMAL_ID, T1)
    await touchAnimal(db, ANIMAL_ID, T2)

    await expect(outboxRows(db)).resolves.toEqual([])
  })

  it('alimente la file à la création une fois la synchronisation activée', async () => {
    await enableSync(db)

    await insertAnimal(db, ANIMAL_ID, T1)

    await expect(outboxRows(db)).resolves.toEqual([
      { entity: 'animal', entity_id: ANIMAL_ID, queued_at: T1, attempts: 0 },
    ])
  })

  it('alimente la file à la modification', async () => {
    await enableSync(db)
    await insertAnimal(db, ANIMAL_ID, T1)

    await touchAnimal(db, ANIMAL_ID, T2)

    await expect(outboxRows(db)).resolves.toEqual([
      { entity: 'animal', entity_id: ANIMAL_ID, queued_at: T2, attempts: 0 },
    ])
  })

  it("n'ajoute qu'une entrée pour deux écritures rapprochées sur la même ligne", async () => {
    await enableSync(db)
    await insertAnimal(db, ANIMAL_ID, T1)

    await touchAnimal(db, ANIMAL_ID, T2)
    await touchAnimal(db, ANIMAL_ID, T3)

    const rows = await outboxRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.queued_at).toBe(T3)
  })

  it('avance queued_at par ON CONFLICT DO UPDATE plutôt que de laisser la première valeur', async () => {
    await enableSync(db)
    await insertAnimal(db, ANIMAL_ID, T1)
    const [firstEntry] = await outboxRows(db)
    expect(firstEntry?.queued_at).toBe(T1)

    await touchAnimal(db, ANIMAL_ID, T2)

    const [updatedEntry] = await outboxRows(db)
    expect(updatedEntry?.queued_at).toBe(T2)
    expect(updatedEntry?.queued_at).not.toBe(T1)
  })

  it('ignore les écritures faites pendant que la synchronisation redevient désactivée', async () => {
    await enableSync(db)
    await insertAnimal(db, ANIMAL_ID, T1)
    await db.run('UPDATE sync_state SET enabled = 0 WHERE id = 1')

    await touchAnimal(db, ANIMAL_ID, T2)

    const [entry] = await outboxRows(db)
    expect(entry?.queued_at).toBe(T1)
  })

  const VACCINATION_ID = '22222222-2222-4222-8222-222222222222'
  const TREATMENT_ID = '33333333-3333-4333-8333-333333333333'
  const WEIGHT_ENTRY_ID = '44444444-4444-4444-8444-444444444444'

  it.each([
    {
      entity: 'vaccination',
      id: VACCINATION_ID,
      insert: insertVaccination,
      touch: touchVaccination,
    },
    { entity: 'treatment', id: TREATMENT_ID, insert: insertTreatment, touch: touchTreatment },
    {
      entity: 'weight_entry',
      id: WEIGHT_ENTRY_ID,
      insert: insertWeightEntry,
      touch: touchWeightEntry,
    },
  ])('alimente et met à jour la file pour $entity', async ({ entity, id, insert, touch }) => {
    await enableSync(db)
    await insertAnimal(db, ANIMAL_ID, T1)

    await insert(db, id, ANIMAL_ID, T1)
    await expect(outboxRows(db)).resolves.toContainEqual({
      entity,
      entity_id: id,
      queued_at: T1,
      attempts: 0,
    })

    await touch(db, id, T2)

    const rows = await outboxRows(db)
    expect(rows.filter((row) => row.entity === entity)).toEqual([
      { entity, entity_id: id, queued_at: T2, attempts: 0 },
    ])
  })
})
