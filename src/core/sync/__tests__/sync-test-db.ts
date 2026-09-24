import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'

export const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'

export interface OutboxRow {
  entity: string
  entity_id: string
  queued_at: string
  attempts: number
}

export async function createSyncTestDb(): Promise<InMemoryDb> {
  const db = await createInMemoryDb()
  await db.execute('PRAGMA foreign_keys = ON')
  return db
}

export async function enableSync(db: InMemoryDb): Promise<void> {
  await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
}

export async function outboxRows(db: InMemoryDb): Promise<OutboxRow[]> {
  return db.query<OutboxRow>(
    'SELECT entity, entity_id, queued_at, attempts FROM sync_outbox ORDER BY entity, entity_id',
  )
}

export async function insertAnimal(
  db: InMemoryDb,
  id: string,
  updatedAt: string,
  name = 'Miette',
): Promise<void> {
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES (?, ?, 'cat', ?, ?)`,
    [id, name, updatedAt, updatedAt],
  )
}

export async function touchAnimal(db: InMemoryDb, id: string, updatedAt: string): Promise<void> {
  await db.run('UPDATE animal SET updated_at = ? WHERE id = ?', [updatedAt, id])
}

export async function insertVaccination(
  db: InMemoryDb,
  id: string,
  animalId: string,
  updatedAt: string,
): Promise<void> {
  await db.run(
    `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at)
     VALUES (?, ?, 'Rage', ?, ?)`,
    [id, animalId, updatedAt, updatedAt],
  )
}

export async function touchVaccination(
  db: InMemoryDb,
  id: string,
  updatedAt: string,
): Promise<void> {
  await db.run('UPDATE vaccination SET updated_at = ? WHERE id = ?', [updatedAt, id])
}

export async function insertTreatment(
  db: InMemoryDb,
  id: string,
  animalId: string,
  updatedAt: string,
): Promise<void> {
  await db.run(
    `INSERT INTO treatment
       (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
     VALUES (?, ?, 'Bravecto', 'antiparasitic', 1, 'month', ?, ?)`,
    [id, animalId, updatedAt, updatedAt],
  )
}

export async function touchTreatment(db: InMemoryDb, id: string, updatedAt: string): Promise<void> {
  await db.run('UPDATE treatment SET updated_at = ? WHERE id = ?', [updatedAt, id])
}

export async function insertWeightEntry(
  db: InMemoryDb,
  id: string,
  animalId: string,
  updatedAt: string,
): Promise<void> {
  await db.run(
    `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at)
     VALUES (?, ?, 4.2, '2026-01-01', ?, ?)`,
    [id, animalId, updatedAt, updatedAt],
  )
}

export async function touchWeightEntry(
  db: InMemoryDb,
  id: string,
  updatedAt: string,
): Promise<void> {
  await db.run('UPDATE weight_entry SET updated_at = ? WHERE id = ?', [updatedAt, id])
}
