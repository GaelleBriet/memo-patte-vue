// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrationTableNames } from '../clear-all-tables'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '22222222-2222-4222-8222-222222222222'
const CARRE = '33333333-3333-4333-8333-333333333333'
const RAGE = '44444444-4444-4444-8444-444444444444'
const TYPHUS = '55555555-5555-4555-8555-555555555555'
const BRAVECTO = '66666666-6666-4666-8666-666666666666'
const MILBEMAX = '77777777-7777-4777-8777-777777777777'
const PESEE = '88888888-8888-4888-8888-888888888888'

const T1 = '2026-01-10T08:00:00.000Z'
const T2 = '2026-07-08T09:30:00.000Z'
const DELETED = '2026-09-01T12:00:00.000Z'

async function seedVersion5(db: InMemoryDb): Promise<void> {
  await db.runMany([
    {
      sql: `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES (?, 'Milo', 'dog', ?, ?), (?, 'Luna', 'cat', ?, ?)`,
      params: [MILO, T1, T1, LUNA, T1, T1],
    },
    {
      sql: `INSERT INTO vaccination (id, animal_id, name, last_injection_date, due_date, created_at, updated_at, deleted_at)
            VALUES (?, ?, 'Carré', '2025-09-25', '2026-09-25', ?, ?, NULL),
                   (?, ?, 'Rage', '2024-03-01', NULL, ?, ?, NULL),
                   (?, ?, 'Typhus', '2025-05-20', '2026-05-20', ?, ?, ?)`,
      params: [CARRE, MILO, T1, T2, RAGE, LUNA, T1, T1, TYPHUS, LUNA, T1, DELETED, DELETED],
    },
    {
      sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, last_dose_date, next_due_date, created_at, updated_at, deleted_at)
            VALUES (?, ?, 'Bravecto', 'antiparasitic', 3, 'month', '2026-07-08', '2026-10-08', ?, ?, NULL),
                   (?, ?, 'Milbemax', 'deworming', 2, 'week', '2026-08-01', '2026-08-15', ?, ?, ?)`,
      params: [BRAVECTO, MILO, T1, T2, MILBEMAX, LUNA, T1, DELETED, DELETED],
    },
    {
      sql: `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at) VALUES (?, ?, 4.2, '2026-01-10', ?, ?)`,
      params: [PESEE, LUNA, T1, T1],
    },
    {
      sql: `INSERT INTO sync_outbox (entity, entity_id, queued_at, attempts)
            VALUES ('vaccination', ?, ?, 2), ('treatment', ?, ?, 0), ('weight_entry', ?, ?, 1)`,
      params: [CARRE, T2, BRAVECTO, T2, PESEE, T1],
    },
  ])
}

async function tableNames(db: InMemoryDb): Promise<string[]> {
  const rows = await db.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  )
  return rows.map(({ name }) => name)
}

async function columnNames(db: InMemoryDb, table: string): Promise<string[]> {
  const rows = await db.query<{ name: string }>(`PRAGMA table_info(${table})`)
  return rows.map(({ name }) => name)
}

async function foreignKeys(db: InMemoryDb, table: string) {
  const rows = await db.query<{ table: string; from: string; to: string; on_delete: string }>(
    `PRAGMA foreign_key_list(${table})`,
  )
  return rows
    .map(({ table: parent, from, to, on_delete }) => ({ parent, from, to, on_delete }))
    .sort((a, b) => a.from.localeCompare(b.from))
}

async function indexedColumns(db: InMemoryDb, index: string): Promise<string[]> {
  const rows = await db.query<{ name: string }>(`PRAGMA index_info(${index})`)
  return rows.map(({ name }) => name)
}

describe('migration v6 : historique des vaccins et des traitements', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute('PRAGMA foreign_keys = ON')
    await applyMigrations(db, 5)
    await seedVersion5(db)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 6 sans laisser de table temporaire', async () => {
    await applyMigrations(db)

    const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(6)
    expect(await tableNames(db)).toEqual([...migrationTableNames()].sort())
    await expect(
      db.query(`SELECT name FROM sqlite_master WHERE sql LIKE '%_old%'`),
    ).resolves.toEqual([])
  })

  it('reconstruit vaccination sans ses dates, lignes et identifiants conservés', async () => {
    await applyMigrations(db)

    expect(await columnNames(db, 'vaccination')).toEqual([
      'id',
      'animal_id',
      'name',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
    await expect(db.query('SELECT * FROM vaccination ORDER BY name')).resolves.toEqual([
      {
        id: CARRE,
        animal_id: MILO,
        name: 'Carré',
        created_at: T1,
        updated_at: T2,
        deleted_at: null,
      },
      { id: RAGE, animal_id: LUNA, name: 'Rage', created_at: T1, updated_at: T1, deleted_at: null },
      {
        id: TYPHUS,
        animal_id: LUNA,
        name: 'Typhus',
        created_at: T1,
        updated_at: DELETED,
        deleted_at: DELETED,
      },
    ])
  })

  it('donne à chaque vaccin une première injection de même identifiant, tombstones compris', async () => {
    await applyMigrations(db)

    await expect(
      db.query('SELECT * FROM vaccination_injection ORDER BY injected_on'),
    ).resolves.toEqual([
      {
        id: RAGE,
        vaccination_id: RAGE,
        animal_id: LUNA,
        injected_on: '2024-03-01',
        next_due_date: null,
        created_at: T1,
        updated_at: T1,
        deleted_at: null,
      },
      {
        id: TYPHUS,
        vaccination_id: TYPHUS,
        animal_id: LUNA,
        injected_on: '2025-05-20',
        next_due_date: '2026-05-20',
        created_at: T1,
        updated_at: DELETED,
        deleted_at: DELETED,
      },
      {
        id: CARRE,
        vaccination_id: CARRE,
        animal_id: MILO,
        injected_on: '2025-09-25',
        next_due_date: '2026-09-25',
        created_at: T1,
        updated_at: T2,
        deleted_at: null,
      },
    ])
  })

  it('reconstruit treatment sans ses dates, avec stopped_on vide', async () => {
    await applyMigrations(db)

    expect(await columnNames(db, 'treatment')).toEqual([
      'id',
      'animal_id',
      'name',
      'type',
      'frequency_value',
      'frequency_unit',
      'stopped_on',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
    await expect(db.query('SELECT * FROM treatment ORDER BY name')).resolves.toEqual([
      {
        id: BRAVECTO,
        animal_id: MILO,
        name: 'Bravecto',
        type: 'antiparasitic',
        frequency_value: 3,
        frequency_unit: 'month',
        stopped_on: null,
        created_at: T1,
        updated_at: T2,
        deleted_at: null,
      },
      {
        id: MILBEMAX,
        animal_id: LUNA,
        name: 'Milbemax',
        type: 'deworming',
        frequency_value: 2,
        frequency_unit: 'week',
        stopped_on: null,
        created_at: T1,
        updated_at: DELETED,
        deleted_at: DELETED,
      },
    ])
  })

  it('donne à chaque traitement une première prise de même identifiant, fréquence recopiée', async () => {
    await applyMigrations(db)

    await expect(db.query('SELECT * FROM treatment_dose ORDER BY given_on')).resolves.toEqual([
      {
        id: BRAVECTO,
        treatment_id: BRAVECTO,
        animal_id: MILO,
        given_on: '2026-07-08',
        next_due_date: '2026-10-08',
        frequency_value: 3,
        frequency_unit: 'month',
        created_at: T1,
        updated_at: T2,
        deleted_at: null,
      },
      {
        id: MILBEMAX,
        treatment_id: MILBEMAX,
        animal_id: LUNA,
        given_on: '2026-08-01',
        next_due_date: '2026-08-15',
        frequency_value: 2,
        frequency_unit: 'week',
        created_at: T1,
        updated_at: DELETED,
        deleted_at: DELETED,
      },
    ])
  })

  it('ne touche ni aux animaux, ni aux pesées, ni à la file de synchronisation', async () => {
    const before = await Promise.all(
      ['animal', 'weight_entry', 'sync_outbox', 'sync_state'].map((table) =>
        db.query(`SELECT * FROM ${table} ORDER BY rowid`),
      ),
    )

    await applyMigrations(db)

    const after = await Promise.all(
      ['animal', 'weight_entry', 'sync_outbox', 'sync_state'].map((table) =>
        db.query(`SELECT * FROM ${table} ORDER BY rowid`),
      ),
    )
    expect(after).toEqual(before)
  })

  it('rattache les événements à leur parent et à leur animal, en cascade', async () => {
    await applyMigrations(db)

    expect(await foreignKeys(db, 'vaccination_injection')).toEqual([
      { parent: 'animal', from: 'animal_id', to: 'id', on_delete: 'CASCADE' },
      { parent: 'vaccination', from: 'vaccination_id', to: 'id', on_delete: 'CASCADE' },
    ])
    expect(await foreignKeys(db, 'treatment_dose')).toEqual([
      { parent: 'animal', from: 'animal_id', to: 'id', on_delete: 'CASCADE' },
      { parent: 'treatment', from: 'treatment_id', to: 'id', on_delete: 'CASCADE' },
    ])
    expect(await foreignKeys(db, 'vaccination')).toEqual([
      { parent: 'animal', from: 'animal_id', to: 'id', on_delete: 'CASCADE' },
    ])
    expect(await foreignKeys(db, 'treatment')).toEqual([
      { parent: 'animal', from: 'animal_id', to: 'id', on_delete: 'CASCADE' },
    ])
    await expect(db.query('PRAGMA foreign_key_check')).resolves.toEqual([])
  })

  it('garde en base les contraintes de chaque prise', async () => {
    await applyMigrations(db)
    const dose = (frequencyValue: number, frequencyUnit: string, nextDueDate: string | null) =>
      db.run(
        `INSERT INTO treatment_dose (id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at)
         VALUES ('d', ?, ?, '2026-09-01', ?, ?, ?, ?, ?)`,
        [BRAVECTO, MILO, nextDueDate, frequencyValue, frequencyUnit, T2, T2],
      )

    await expect(dose(0, 'month', '2026-10-01')).rejects.toThrow(/CHECK constraint failed/)
    await expect(dose(1, 'year', '2027-09-01')).rejects.toThrow(/CHECK constraint failed/)
    await expect(dose(1, 'month', null)).rejects.toThrow(/NOT NULL constraint failed/)
  })

  it('indexe les événements par parent et par animal, et les parents par animal', async () => {
    await applyMigrations(db)

    expect(await indexedColumns(db, 'idx_vaccination_animal_id')).toEqual(['animal_id'])
    expect(await indexedColumns(db, 'idx_treatment_animal_id')).toEqual(['animal_id'])
    expect(await indexedColumns(db, 'idx_vaccination_injection_vaccination')).toEqual([
      'vaccination_id',
      'injected_on',
    ])
    expect(await indexedColumns(db, 'idx_vaccination_injection_animal_id')).toEqual(['animal_id'])
    expect(await indexedColumns(db, 'idx_treatment_dose_treatment')).toEqual([
      'treatment_id',
      'given_on',
    ])
    expect(await indexedColumns(db, 'idx_treatment_dose_animal_id')).toEqual(['animal_id'])
  })

  it('recrée les déclencheurs d’outbox des deux tables reconstruites et crée ceux des deux nouvelles', async () => {
    await applyMigrations(db)
    await db.run('DELETE FROM sync_outbox')
    await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')

    await db.runMany([
      { sql: 'UPDATE vaccination SET updated_at = ? WHERE id = ?', params: [DELETED, RAGE] },
      { sql: 'UPDATE treatment SET updated_at = ? WHERE id = ?', params: [DELETED, BRAVECTO] },
      {
        sql: 'UPDATE vaccination_injection SET updated_at = ? WHERE id = ?',
        params: [DELETED, CARRE],
      },
      {
        sql: `INSERT INTO treatment_dose (id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at)
              VALUES ('nouvelle-prise', ?, ?, '2026-10-10', '2027-01-10', 3, 'month', ?, ?)`,
        params: [BRAVECTO, MILO, DELETED, DELETED],
      },
    ])

    await expect(
      db.query('SELECT entity, entity_id FROM sync_outbox ORDER BY entity'),
    ).resolves.toEqual([
      { entity: 'treatment', entity_id: BRAVECTO },
      { entity: 'treatment_dose', entity_id: 'nouvelle-prise' },
      { entity: 'vaccination', entity_id: RAGE },
      { entity: 'vaccination_injection', entity_id: CARRE },
    ])
    const triggers = await db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`,
    )
    expect(triggers.map(({ name }) => name)).toEqual(
      [
        'animal',
        'treatment',
        'treatment_dose',
        'vaccination',
        'vaccination_injection',
        'weight_entry',
      ]
        .flatMap((table) => [`${table}_outbox_insert`, `${table}_outbox_update`])
        .sort(),
    )
  })

  it('passe aussi clés étrangères coupées, comme sur le web', async () => {
    const webDb = await createSqlJsDbClient()
    await applyMigrations(webDb, 5)
    await seedVersion5(webDb)

    await applyMigrations(webDb)

    await expect(
      webDb.query<{ n: number }>('SELECT COUNT(*) AS n FROM vaccination_injection'),
    ).resolves.toEqual([{ n: 3 }])
    await expect(
      webDb.query<{ n: number }>('SELECT COUNT(*) AS n FROM treatment_dose'),
    ).resolves.toEqual([{ n: 2 }])
    webDb.close()
  })
})
