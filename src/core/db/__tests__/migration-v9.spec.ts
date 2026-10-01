// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrationTableNames } from '../clear-all-tables'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'
import { createVersion8Schema } from './schema-v8'

const MILO = '11111111-1111-4111-8111-111111111111'
const RAGE = '33333333-3333-4333-8333-333333333333'
const BRAVECTO = '44444444-4444-4444-8444-444444444444'
const PESEE = '55555555-5555-4555-8555-555555555555'
const T1 = '2026-01-10T08:00:00.000Z'

async function seedVersion8(db: InMemoryDb): Promise<void> {
  await db.runMany([
    { sql: 'UPDATE sync_state SET enabled = 1, last_pulled_at = ? WHERE id = 1', params: [T1] },
    {
      sql: `INSERT INTO animal (id, name, species, breed, birth_date, initial_weight_kg, created_at, updated_at)
            VALUES (?, 'Milo', 'dog', 'Labrador', '2023-03-12', 8.5, ?, ?)`,
      params: [MILO, T1, T1],
    },
    {
      sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at) VALUES (?, ?, 'Rage', ?, ?)`,
      params: [RAGE, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO vaccination_injection (id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at)
            VALUES (?, ?, ?, '2025-09-25', '2026-09-25', ?, ?)`,
      params: [RAGE, RAGE, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
            VALUES (?, ?, 'Bravecto', 'antiparasitic', 3, 'month', ?, ?)`,
      params: [BRAVECTO, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO treatment_dose (id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at)
            VALUES (?, ?, ?, '2026-07-08', '2026-10-08', 3, 'month', ?, ?)`,
      params: [BRAVECTO, BRAVECTO, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at) VALUES (?, ?, 8.5, '2026-01-10', ?, ?)`,
      params: [PESEE, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO sync_pull_cursor (entity, last_pulled_at) VALUES ('animal', ?)`,
      params: [T1],
    },
  ])
}

async function userVersion(db: InMemoryDb): Promise<number | undefined> {
  const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
  return version?.user_version
}

async function schema(db: InMemoryDb): Promise<{ type: string; name: string; sql: string }[]> {
  return db.query(
    `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
  )
}

async function freshSchema(): Promise<{ type: string; name: string; sql: string }[]> {
  const fresh = await createSqlJsDbClient()
  await applyMigrations(fresh)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v9 d’une base v8 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await createVersion8Schema(db)
    await seedVersion8(db)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 9', async () => {
    await applyMigrations(db)

    expect(await userVersion(db)).toBe(9)
  })

  it('efface toutes les données de test, synchronisation comprise', async () => {
    await applyMigrations(db)

    for (const table of migrationTableNames().filter((name) => name !== 'sync_state')) {
      await expect(db.query(`SELECT * FROM ${table}`)).resolves.toEqual([])
    }
    await expect(db.query('SELECT enabled, last_synced_at FROM sync_state')).resolves.toEqual([
      { enabled: 0, last_synced_at: null },
    ])
  })

  it('donne exactement le schéma d’une installation neuve, sans reste de la v8', async () => {
    await applyMigrations(db)

    expect(await schema(db)).toEqual(await freshSchema())
  })

  it('laisse des clés étrangères cohérentes et actives', async () => {
    await applyMigrations(db)
    await db.execute('PRAGMA foreign_keys = ON')

    await expect(db.query('PRAGMA foreign_key_check')).resolves.toEqual([])
    await expect(
      db.run(
        `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at)
         VALUES (?, ?, 8.5, '2026-01-10', ?, ?)`,
        [PESEE, MILO, T1, T1],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})
