// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const MILO = '11111111-1111-4111-8111-111111111111'
const APPAREIL = '99999999-9999-4999-8999-999999999999'
const AUTRE = '88888888-8888-4888-8888-888888888888'
const CREE = '2026-10-02T08:00:00.000Z'
const MODIFIE = '2026-10-04T08:00:00.000Z'
const REGLE = '2026-10-03T08:00:00.000Z'
const SUPPRIME = '2026-10-05T08:00:00.000Z'

// Identifiant, date d'écriture des réglages, suppression.
const PERIODS: [string, string, string | null][] = [
  ['p1', CREE, null],
  ['p2', REGLE, null],
  ['p3', REGLE, SUPPRIME],
]

function seedVersion16(db: InMemoryDb): Promise<void> {
  const by = [APPAREIL, AUTRE]
  return db.runMany([
    { sql: 'UPDATE sync_state SET enabled = 1 WHERE id = 1' },
    {
      sql: `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device,
              updated_by_device) VALUES (?, 'Milo', 'dog', ?, ?, ?, ?)`,
      params: [MILO, CREE, CREE, ...by],
    },
    {
      sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at,
              created_by_device, updated_by_device) VALUES ('t1', ?, 'Metacam', 'medication', ?, ?, ?, ?)`,
      params: [MILO, CREE, CREE, ...by],
    },
    ...PERIODS.map(([id, settingsWrittenAt, deletedAt], index) => ({
      sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
              grid_origin_on, first_due_chosen, fallen_doses_answer, ends_on, frequency_value,
              frequency_unit, times, dose_quantity, dose_unit, created_at, updated_at,
              settings_written_at, deleted_at, created_by_device, updated_by_device)
            VALUES (?, 't1', ?, ?, ?, ?, 1, 'not-due', '2026-12-31', 2, 'day', '08:00,20:00', 1.5,
              'tablet', ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        MILO,
        `2026-10-0${index + 1}`,
        `2026-10-0${index + 1}`,
        `2026-10-0${index + 1}`,
        CREE,
        MODIFIE,
        settingsWrittenAt,
        deletedAt,
        ...by,
      ],
    })),
    {
      sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
              status, target_on, previous_target_on, previous_target_time, due_rank, created_at,
              updated_at, created_by_device, updated_by_device)
            VALUES ('d1', 'p2', 't1', ?, '2026-10-05', '20:00', 'postponed', '2026-10-06',
              '2026-10-05', '20:00', 2, ?, ?, ?, ?)`,
      params: [MILO, CREE, MODIFIE, ...by],
    },
    {
      sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
              status, given_on, created_at, updated_at, created_by_device, updated_by_device)
            VALUES ('d2', 'p1', 't1', ?, '2026-10-01', '08:00', 'given', '2026-10-01', ?, ?, ?, ?)`,
      params: [MILO, CREE, CREE, ...by],
    },
  ])
}

async function userVersion(db: InMemoryDb): Promise<number | undefined> {
  const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
  return version?.user_version
}

async function schema(db: InMemoryDb) {
  return db.query<{ type: string; name: string; sql: string }>(
    `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
  )
}

async function freshSchema() {
  const fresh = await createSqlJsDbClient()
  await applyMigrations(fresh, 17)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const rows = (db: InMemoryDb, table: string) =>
  db.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY id`)

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v17 d’une base v16 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 16)
    await seedVersion16(db)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 17, au schéma exact d’une installation neuve', async () => {
    await applyMigrations(db, 17)

    expect(await userVersion(db)).toBe(17)
    expect(await schema(db)).toEqual(await freshSchema())
  })

  it('garde chaque autre colonne des réglages et toutes les prises, appareils, dates et suppressions compris', async () => {
    const periodsBefore = await rows(db, 'treatment_period')
    const dosesBefore = await rows(db, 'treatment_dose')

    await applyMigrations(db, 17)

    const without = (row: Record<string, unknown>) => {
      const kept = { ...row }
      delete kept.grid_written_at
      return kept
    }
    expect((await rows(db, 'treatment_period')).map(without)).toEqual(periodsBefore)
    expect(await rows(db, 'treatment_dose')).toEqual(dosesBefore)
  })

  it('la dernière écriture de la grille vaut celle des réglages', async () => {
    await applyMigrations(db, 17)

    await expect(
      db.query('SELECT id, grid_written_at FROM treatment_period ORDER BY id'),
    ).resolves.toEqual([
      { id: 'p1', grid_written_at: CREE },
      { id: 'p2', grid_written_at: REGLE },
      { id: 'p3', grid_written_at: REGLE },
    ])
  })

  it('n’envoie rien à la synchronisation : la migration Supabase pose les mêmes valeurs', async () => {
    await db.execute('DELETE FROM sync_outbox')

    await applyMigrations(db, 17)

    await expect(db.query('SELECT * FROM sync_outbox')).resolves.toEqual([])
  })

  it('met de nouveau en file d’envoi un réglage et une prise écrits après la migration', async () => {
    await applyMigrations(db, 17)
    await db.execute('DELETE FROM sync_outbox')

    await db.run(
      `UPDATE treatment_period SET ends_on = '2026-11-30', grid_written_at = ?, updated_at = ?
       WHERE id = 'p2'`,
      ['2026-10-19T08:00:00.000Z', '2026-10-19T08:00:00.000Z'],
    )
    await db.run(`UPDATE treatment_dose SET target_on = '2026-10-07' WHERE id = 'd1'`)

    await expect(
      db.query('SELECT entity, entity_id FROM sync_outbox ORDER BY entity_id'),
    ).resolves.toEqual([
      { entity: 'treatment_dose', entity_id: 'd1' },
      { entity: 'treatment_period', entity_id: 'p2' },
    ])
  })

  it('reste en version 16, carnet intact, quand une instruction de la v17 échoue', async () => {
    await db.execute('CREATE VIEW treatment_dose_v16 AS SELECT 1 AS id')
    const schemaAvant = await schema(db)
    const periodsAvant = await rows(db, 'treatment_period')
    const dosesAvant = await rows(db, 'treatment_dose')

    await expect(applyMigrations(db, 17)).rejects.toThrow(/already exists/)

    expect(await userVersion(db)).toBe(16)
    expect(await schema(db)).toEqual(schemaAvant)
    await expect(rows(db, 'treatment_period')).resolves.toEqual(periodsAvant)
    await expect(rows(db, 'treatment_dose')).resolves.toEqual(dosesAvant)
  })

  it('laisse des clés étrangères cohérentes et actives', async () => {
    await applyMigrations(db, 17)
    await db.execute('PRAGMA foreign_keys = ON')

    await expect(db.query('PRAGMA foreign_key_check')).resolves.toEqual([])
    await expect(
      db.run(
        `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, status,
           created_at, updated_at, created_by_device, updated_by_device)
         VALUES ('x', 'inconnue', 't1', ?, '2026-10-01', 'missed', ?, ?, ?, ?)`,
        [MILO, CREE, CREE, APPAREIL, APPAREIL],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })

  it('refuse un réglage sans date d’écriture de la grille', async () => {
    await applyMigrations(db, 17)

    await expect(
      db.run(`UPDATE treatment_period SET grid_written_at = NULL WHERE id = 'p1'`),
    ).rejects.toThrow(/NOT NULL constraint failed/)
  })
})
