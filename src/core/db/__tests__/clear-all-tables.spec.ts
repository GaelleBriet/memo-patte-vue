// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearAllTables, migrationTableNames } from '../clear-all-tables'
import { createInMemoryDb, type InMemoryDb } from './in-memory-db'

const NOW = '2026-09-13T10:00:00.000Z'

describe('migrationTableNames', () => {
  it('liste une fois chaque table créée par les migrations, dans leur ordre de dernière création', () => {
    expect(migrationTableNames()).toEqual([
      'device',
      'animal',
      'weight_entry',
      'carnet_settings',
      'vaccination',
      'vaccination_injection',
      'treatment',
      'treatment_period',
      'treatment_dose',
      'sync_outbox',
      'sync_state',
      'sync_pull_cursor',
    ])
  })

  it('s’arrête, sur demande, aux tables créées jusqu’à une version', () => {
    expect(migrationTableNames(8)).toEqual([])
    expect(migrationTableNames(9)).toEqual([
      'animal',
      'weight_entry',
      'carnet_settings',
      'vaccination',
      'vaccination_injection',
      'treatment',
      'treatment_dose',
      'sync_outbox',
      'sync_state',
      'sync_pull_cursor',
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
        sql: `INSERT INTO animal (id, name, species, created_at, updated_at, deleted_at, created_by_device, updated_by_device)
              VALUES ('a-1', 'Vasco', 'dog', ?, ?, NULL, 'appareil-test', 'appareil-test'), ('a-2', 'Miette', 'cat', ?, ?, ?, 'appareil-test', 'appareil-test')`,
        params: [NOW, NOW, NOW, NOW, NOW],
      },
      {
        sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at, deleted_at, created_by_device, updated_by_device)
              VALUES ('v-1', 'a-1', 'Rage', ?, ?, ?, 'appareil-test', 'appareil-test')`,
        params: [NOW, NOW, NOW],
      },
      {
        sql: `INSERT INTO vaccination_injection (id, vaccination_id, animal_id, injected_on, created_at, updated_at, deleted_at, created_by_device, updated_by_device)
              VALUES ('v-1', 'v-1', 'a-1', '2026-01-15', ?, ?, ?, 'appareil-test', 'appareil-test')`,
        params: [NOW, NOW, NOW],
      },
      {
        sql: `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at, created_by_device, updated_by_device)
              VALUES ('w-1', 'a-1', 24.5, '2026-09-01', ?, ?, 'appareil-test', 'appareil-test')`,
        params: [NOW, NOW],
      },
      {
        sql: `INSERT INTO carnet_settings (id, vaccine_reminder_time, created_at, updated_at, created_by_device, updated_by_device)
              VALUES ('00000000-0000-0000-0000-000000000000', '08:30', ?, ?, 'appareil-test', 'appareil-test')`,
        params: [NOW, NOW],
      },
      {
        sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at, created_by_device, updated_by_device)
              VALUES ('t-1', 'a-2', 'Milbemax', 'deworming', ?, ?, 'appareil-test', 'appareil-test')`,
        params: [NOW, NOW],
      },
      {
        sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
                frequency_value, frequency_unit, created_at, updated_at, reference_on, created_by_device, updated_by_device)
              VALUES ('t-1', 't-1', 'a-2', '2026-08-01', '2026-08-01', 3, 'month', ?, ?, '2026-08-01', 'appareil-test', 'appareil-test')`,
        params: [NOW, NOW],
      },
      {
        sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, given_on,
                status, next_due_date, created_at, updated_at, created_by_device, updated_by_device)
              VALUES ('t-1', 't-1', 't-1', 'a-2', '2026-08-01', '2026-08-01', 'given', '2026-11-01', ?, ?, 'appareil-test', 'appareil-test')`,
        params: [NOW, NOW],
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  it('vide toutes les tables, lignes marquées supprimées comprises, les enfants avant leurs parents', async () => {
    await db.execute(
      `CREATE TRIGGER enfant_d_abord BEFORE DELETE ON treatment_period
       WHEN EXISTS (SELECT 1 FROM treatment_dose WHERE period_id = OLD.id)
       BEGIN SELECT RAISE(ABORT, 'période vidée avant ses prises'); END`,
    )

    await clearAllTables(db)

    for (const table of migrationTableNames()) {
      await expect(db.query(`SELECT * FROM ${table}`)).resolves.toEqual([])
    }
  })

  it('laisse les tables en place : une écriture reste possible ensuite', async () => {
    await clearAllTables(db)

    await expect(
      db.run(
        `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device) VALUES ('a-3', 'Nala', 'cat', ?, ?, 'appareil-test', 'appareil-test')`,
        [NOW, NOW],
      ),
    ).resolves.toBe(1)
  })
})
