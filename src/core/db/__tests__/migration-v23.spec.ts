// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const APPAREIL = '99999999-9999-4999-8999-999999999999'
const SEPTEMBRE_1 = new Date(2026, 8, 1, 8).toISOString()
const OCTOBRE_21_8_15 = new Date(2026, 9, 21, 8, 15).toISOString()
const OCTOBRE_21_8_30 = new Date(2026, 9, 21, 8, 30).toISOString()

async function insertMiloWithWeighing(db: InMemoryDb): Promise<void> {
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device,
       updated_by_device) VALUES ('milo', 'Milo', 'dog', ?, ?, ?, ?)`,
    [SEPTEMBRE_1, SEPTEMBRE_1, APPAREIL, APPAREIL],
  )
  await db.run(
    `INSERT INTO weight_entry (id, animal_id, measured_on, weight_kg, created_at, updated_at,
       created_by_device, updated_by_device) VALUES ('w-1', 'milo', '2026-10-21', 9.9, ?, ?, ?, ?)`,
    [OCTOBRE_21_8_30, OCTOBRE_21_8_30, APPAREIL, APPAREIL],
  )
}

async function schema(db: InMemoryDb) {
  return db.query<{ type: string; name: string; sql: string }>(
    `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
  )
}

async function freshSchema() {
  const fresh = await createSqlJsDbClient()
  await applyMigrations(fresh, 23)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const outbox = (db: InMemoryDb) =>
  db.query<{ entity: string; refused_at: string | null }>(
    'SELECT entity, refused_at FROM sync_outbox ORDER BY entity, entity_id',
  )

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v23, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 22)
    await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
    await insertMiloWithWeighing(db)
    await db.run('UPDATE sync_outbox SET refused_at = ?', [OCTOBRE_21_8_15])
  })

  afterEach(() => {
    db.close()
  })

  it('porte une base v22 en version 23, au schéma exact d’une installation neuve, file et marques intactes', async () => {
    const queuedBefore = await db.query('SELECT * FROM sync_outbox ORDER BY entity, entity_id')

    await applyMigrations(db, 23)

    const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(23)
    expect(await schema(db)).toEqual(await freshSchema())
    await expect(db.query('SELECT * FROM sync_outbox ORDER BY entity, entity_id')).resolves.toEqual(
      queuedBefore,
    )
  })

  it('Milo sorti de la file après un échec, une fois la mise à niveau faite : sa pesée refusée avec lui repart', async () => {
    await applyMigrations(db, 23)
    await db.run("UPDATE sync_outbox SET attempts = 1 WHERE entity = 'animal'")

    await db.run("DELETE FROM sync_outbox WHERE entity = 'animal' AND entity_id = 'milo'")

    await expect(outbox(db)).resolves.toEqual([{ entity: 'weight_entry', refused_at: null }])
  })

  it('Milo sorti de la file sans avoir échoué : sa pesée garde sa marque', async () => {
    await applyMigrations(db, 23)

    await db.run("DELETE FROM sync_outbox WHERE entity = 'animal' AND entity_id = 'milo'")

    await expect(outbox(db)).resolves.toEqual([
      { entity: 'weight_entry', refused_at: OCTOBRE_21_8_15 },
    ])
  })
})
