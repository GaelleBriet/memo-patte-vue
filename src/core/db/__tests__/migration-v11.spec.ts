// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrationTableNames } from '../clear-all-tables'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const MILO = '11111111-1111-4111-8111-111111111111'
const RAGE = '33333333-3333-4333-8333-333333333333'
const BRAVECTO = '44444444-4444-4444-8444-444444444444'
const PESEE = '55555555-5555-4555-8555-555555555555'
const PERIODE = '66666666-6666-4666-8666-666666666666'
const PRISE = '77777777-7777-4777-8777-777777777777'
const CARNET_SETTINGS_ID = '00000000-0000-0000-0000-000000000000'
const T1 = '2026-10-02T08:00:00.000Z'

async function seedVersion10(db: InMemoryDb): Promise<void> {
  await db.runMany([
    { sql: 'UPDATE sync_state SET enabled = 1, last_synced_at = ? WHERE id = 1', params: [T1] },
    {
      sql: `INSERT INTO animal (id, name, species, created_at, updated_at)
            VALUES (?, 'Milo', 'dog', ?, ?)`,
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
      sql: `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at)
            VALUES (?, ?, 8.5, '2026-09-30', ?, ?)`,
      params: [PESEE, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO carnet_settings (id, vaccine_reminder_time, created_at, updated_at)
            VALUES (?, '08:30', ?, ?)`,
      params: [CARNET_SETTINGS_ID, T1, T1],
    },
    {
      sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at)
            VALUES (?, ?, 'Bravecto', 'antiparasitic', ?, ?)`,
      params: [BRAVECTO, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
              frequency_value, frequency_unit, created_at, updated_at)
            VALUES (?, ?, ?, '2026-07-08', '2026-07-08', 3, 'month', ?, ?)`,
      params: [PERIODE, BRAVECTO, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, given_on,
              status, next_due_date, created_at, updated_at)
            VALUES (?, ?, ?, ?, '2026-07-08', '2026-07-08', 'given', '2026-10-08', ?, ?)`,
      params: [PRISE, PERIODE, BRAVECTO, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO sync_pull_cursor (entity, last_pulled_at)
            VALUES ('animal', ?), ('treatment_dose', ?)`,
      params: [T1, T1],
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
])('migration v11 d’une base v10 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 10)
    await seedVersion10(db)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 11', async () => {
    await applyMigrations(db)

    expect(await userVersion(db)).toBe(11)
  })

  it('repart d’un carnet vide, données de test, appareils compris', async () => {
    await applyMigrations(db)

    for (const table of migrationTableNames()) {
      if (table === 'sync_state') continue
      await expect(db.query(`SELECT * FROM ${table}`)).resolves.toEqual([])
    }
  })

  it('remet la synchronisation à son état d’une installation neuve', async () => {
    await applyMigrations(db)

    await expect(db.query('SELECT * FROM sync_state')).resolves.toEqual([
      { id: 1, enabled: 0, restoring: 0, last_synced_at: null },
    ])
  })

  it('reste en version 10, carnet et schéma intacts, quand une instruction de la v11 échoue', async () => {
    await db.execute('CREATE VIEW device AS SELECT 1 AS id')
    const schemaAvant = await schema(db)

    await expect(applyMigrations(db)).rejects.toThrow(/use DROP VIEW/)

    expect(await userVersion(db)).toBe(10)
    expect(await schema(db)).toEqual(schemaAvant)
    await expect(db.query('SELECT status FROM treatment_dose')).resolves.toEqual([
      { status: 'given' },
    ])
  })

  it('donne exactement le schéma d’une installation neuve, sans reste de la v10', async () => {
    await applyMigrations(db)

    expect(await schema(db)).toEqual(await freshSchema())
  })

  it('laisse des clés étrangères cohérentes et actives', async () => {
    await applyMigrations(db)
    await db.execute('PRAGMA foreign_keys = ON')

    await expect(db.query('PRAGMA foreign_key_check')).resolves.toEqual([])
    await expect(
      db.run(
        `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at,
           created_by_device, updated_by_device)
         VALUES (?, ?, 'Bravecto', 'antiparasitic', ?, ?, 'appareil', 'appareil')`,
        [BRAVECTO, MILO, T1, T1],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})
