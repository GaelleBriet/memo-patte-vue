// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearAllTables, migrationTableNames } from '../clear-all-tables'
import { createInMemoryDb, type InMemoryDb } from './in-memory-db'

const NOW = '2026-09-13T10:00:00.000Z'

describe('migrationTableNames', () => {
  it('liste une fois chaque table créée par les migrations, dans leur ordre de première création', () => {
    expect(migrationTableNames()).toEqual([
      'animal',
      'vaccination',
      'weight_entry',
      'treatment',
      'sync_outbox',
      'sync_state',
      'vaccination_injection',
      'treatment_dose',
    ])
  })

  it('couvre chaque table réellement présente en base après migration', async () => {
    const db = await createInMemoryDb()
    const rows = await db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    db.close()

    expect(rows.map((row) => row.name)).toEqual([...migrationTableNames()].sort())
  })
})

describe('clearAllTables', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.runMany([
      {
        sql: `INSERT INTO animal (id, name, species, created_at, updated_at, deleted_at)
              VALUES ('a-1', 'Vasco', 'dog', ?, ?, NULL), ('a-2', 'Miette', 'cat', ?, ?, ?)`,
        params: [NOW, NOW, NOW, NOW, NOW],
      },
      {
        sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at, deleted_at)
              VALUES ('v-1', 'a-1', 'Rage', ?, ?, ?)`,
        params: [NOW, NOW, NOW],
      },
      {
        sql: `INSERT INTO vaccination_injection (id, vaccination_id, animal_id, injected_on, created_at, updated_at, deleted_at)
              VALUES ('v-1', 'v-1', 'a-1', '2026-01-15', ?, ?, ?)`,
        params: [NOW, NOW, NOW],
      },
      {
        sql: `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at)
              VALUES ('w-1', 'a-1', 24.5, '2026-09-01', ?, ?)`,
        params: [NOW, NOW],
      },
      {
        sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
              VALUES ('t-1', 'a-2', 'Milbemax', 'deworming', 3, 'month', ?, ?)`,
        params: [NOW, NOW],
      },
      {
        sql: `INSERT INTO treatment_dose (id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at)
              VALUES ('t-1', 't-1', 'a-2', '2026-08-01', '2026-11-01', 3, 'month', ?, ?)`,
        params: [NOW, NOW],
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  it('vide toutes les tables, lignes marquées supprimées comprises', async () => {
    await clearAllTables(db)

    for (const table of migrationTableNames()) {
      await expect(db.query(`SELECT * FROM ${table}`)).resolves.toEqual([])
    }
  })

  it('laisse les tables en place : une écriture reste possible ensuite', async () => {
    await clearAllTables(db)

    await expect(
      db.run(
        `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES ('a-3', 'Nala', 'cat', ?, ?)`,
        [NOW, NOW],
      ),
    ).resolves.toBe(1)
  })
})
