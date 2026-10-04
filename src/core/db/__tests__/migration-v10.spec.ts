// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const MILO = '11111111-1111-4111-8111-111111111111'
const RAGE = '33333333-3333-4333-8333-333333333333'
const BRAVECTO = '44444444-4444-4444-8444-444444444444'
const PESEE = '55555555-5555-4555-8555-555555555555'
const CARNET_SETTINGS_ID = '00000000-0000-0000-0000-000000000000'
const T1 = '2026-09-30T08:00:00.000Z'

async function seedVersion9(db: InMemoryDb): Promise<void> {
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
      sql: `INSERT INTO sync_pull_cursor (entity, last_pulled_at)
            VALUES ('animal', ?), ('treatment', ?), ('treatment_dose', ?)`,
      params: [T1, T1, T1],
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
  await applyMigrations(fresh, 10)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v10 d’une base v9 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 9)
    await seedVersion9(db)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 10', async () => {
    await applyMigrations(db, 10)

    expect(await userVersion(db)).toBe(10)
  })

  it('efface les traitements et leurs prises, données de test', async () => {
    await applyMigrations(db, 10)

    for (const table of ['treatment', 'treatment_period', 'treatment_dose']) {
      await expect(db.query(`SELECT * FROM ${table}`)).resolves.toEqual([])
    }
  })

  it('garde le reste du carnet, réglages et synchronisation compris', async () => {
    await applyMigrations(db, 10)

    await expect(db.query('SELECT id FROM animal')).resolves.toEqual([{ id: MILO }])
    await expect(db.query('SELECT id FROM vaccination')).resolves.toEqual([{ id: RAGE }])
    await expect(db.query('SELECT id FROM vaccination_injection')).resolves.toEqual([{ id: RAGE }])
    await expect(db.query('SELECT id FROM weight_entry')).resolves.toEqual([{ id: PESEE }])
    await expect(db.query('SELECT vaccine_reminder_time FROM carnet_settings')).resolves.toEqual([
      { vaccine_reminder_time: '08:30' },
    ])
    await expect(db.query('SELECT enabled, last_synced_at FROM sync_state')).resolves.toEqual([
      { enabled: 1, last_synced_at: T1 },
    ])
  })

  it('ne touche ni à la file d’envoi ni aux curseurs : le cycle retire seul une entrée sans ligne', async () => {
    const avant = {
      outbox: await db.query('SELECT * FROM sync_outbox ORDER BY entity, entity_id'),
      cursors: await db.query('SELECT * FROM sync_pull_cursor ORDER BY entity'),
    }

    await applyMigrations(db, 10)

    expect({
      outbox: await db.query('SELECT * FROM sync_outbox ORDER BY entity, entity_id'),
      cursors: await db.query('SELECT * FROM sync_pull_cursor ORDER BY entity'),
    }).toEqual(avant)
    expect(avant.outbox).toContainEqual(expect.objectContaining({ entity: 'treatment_dose' }))
  })

  it('reste en version 9, carnet et schéma intacts, quand une instruction de la v10 échoue', async () => {
    await db.execute('CREATE VIEW treatment_period AS SELECT 1 AS id')
    const schemaAvant = await schema(db)

    await expect(applyMigrations(db, 10)).rejects.toThrow(/views may not be indexed/)

    expect(await userVersion(db)).toBe(9)
    expect(await schema(db)).toEqual(schemaAvant)
    await expect(db.query('SELECT name, frequency_value FROM treatment')).resolves.toEqual([
      { name: 'Bravecto', frequency_value: 3 },
    ])
  })

  it('donne exactement le schéma d’une installation neuve, sans reste de la v9', async () => {
    await applyMigrations(db, 10)

    expect(await schema(db)).toEqual(await freshSchema())
  })

  it('laisse des clés étrangères cohérentes et actives', async () => {
    await applyMigrations(db, 10)
    await db.execute('PRAGMA foreign_keys = ON')

    await expect(db.query('PRAGMA foreign_key_check')).resolves.toEqual([])
    await expect(
      db.run(
        `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
           frequency_value, frequency_unit, created_at, updated_at)
         VALUES (?, ?, ?, '2026-10-01', '2026-10-01', 1, 'month', ?, ?)`,
        [BRAVECTO, BRAVECTO, MILO, T1, T1],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})
