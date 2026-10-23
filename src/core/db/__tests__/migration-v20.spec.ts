// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const MILO = '11111111-1111-4111-8111-111111111111'
const APPAREIL = '99999999-9999-4999-8999-999999999999'
const AUTRE = '88888888-8888-4888-8888-888888888888'
const CREE = '2026-10-02T08:00:00.000Z'
const MODIFIE = '2026-10-04T08:00:00.000Z'
const SUPPRIME = '2026-10-05T08:00:00.000Z'

function seedVersion19(db: InMemoryDb): Promise<void> {
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
              created_by_device, updated_by_device) VALUES ('t1', ?, 'Milbemax', 'deworming', ?, ?, ?, ?)`,
      params: [MILO, CREE, CREE, ...by],
    },
    {
      sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
              grid_origin_on, first_due_chosen, fallen_doses_answer, frequency_value,
              frequency_unit, created_at, updated_at, settings_written_at, grid_written_at,
              created_by_device, updated_by_device)
            VALUES ('p1', 't1', ?, '2026-04-04', '2026-04-04', '2026-04-04', 1, 'unasked', 2,
              'week', ?, ?, ?, ?, ?, ?)`,
      params: [MILO, CREE, CREE, CREE, CREE, ...by],
    },
    {
      sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
              status, given_on, created_at, updated_at, created_by_device, updated_by_device)
            VALUES ('d1', 'p1', 't1', ?, '2026-04-04', NULL, 'given', '2026-04-04', ?, ?, ?, ?)`,
      params: [MILO, CREE, CREE, ...by],
    },
    {
      sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
              status, target_on, previous_target_on, previous_target_time, due_rank, created_at,
              updated_at, deleted_at, created_by_device, updated_by_device)
            VALUES ('d2', 'p1', 't1', ?, '2026-04-18', NULL, 'postponed', '2026-04-28',
              '2026-04-20', NULL, 1, ?, ?, ?, ?, ?)`,
      params: [MILO, CREE, MODIFIE, SUPPRIME, ...by],
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
  await applyMigrations(fresh, 20)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const doses = (db: InMemoryDb) =>
  db.query<Record<string, unknown>>('SELECT * FROM treatment_dose ORDER BY id')

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v20 d’une base v19 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 19)
    await seedVersion19(db)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 20, au schéma exact d’une installation neuve', async () => {
    await applyMigrations(db, 20)

    expect(await userVersion(db)).toBe(20)
    expect(await schema(db)).toEqual(await freshSchema())
  })

  it('garde toutes les prises, appareils, dates et suppressions compris ; chacune est décidée à sa dernière écriture', async () => {
    const before = await doses(db)

    await applyMigrations(db, 20)

    const after = await doses(db)
    expect(after.map(({ decided_at: _decidedAt, ...kept }) => kept)).toEqual(before)
    expect(after.map(({ id, decided_at }) => [id, decided_at])).toEqual([
      ['d1', CREE],
      ['d2', MODIFIE],
    ])
  })

  it('n’envoie rien à la synchronisation : la migration Supabase pose les mêmes valeurs', async () => {
    await db.execute('DELETE FROM sync_outbox')

    await applyMigrations(db, 20)

    await expect(db.query('SELECT * FROM sync_outbox')).resolves.toEqual([])
  })

  it('met de nouveau en file d’envoi une prise écrite après la migration', async () => {
    await applyMigrations(db, 20)
    await db.execute('DELETE FROM sync_outbox')

    await db.run(`UPDATE treatment_dose SET given_on = '2026-04-05' WHERE id = 'd1'`)

    await expect(db.query('SELECT entity, entity_id FROM sync_outbox')).resolves.toEqual([
      { entity: 'treatment_dose', entity_id: 'd1' },
    ])
  })

  it('reste en version 19, carnet intact, quand une instruction de la v20 échoue', async () => {
    await db.execute('CREATE VIEW treatment_dose_v19 AS SELECT 1 AS id')
    const schemaAvant = await schema(db)
    const dosesAvant = await doses(db)

    await expect(applyMigrations(db, 20)).rejects.toThrow(/already exists/)

    expect(await userVersion(db)).toBe(19)
    expect(await schema(db)).toEqual(schemaAvant)
    await expect(doses(db)).resolves.toEqual(dosesAvant)
  })

  it('laisse des clés étrangères cohérentes et actives', async () => {
    await applyMigrations(db, 20)
    await db.execute('PRAGMA foreign_keys = ON')

    await expect(db.query('PRAGMA foreign_key_check')).resolves.toEqual([])
    await expect(
      db.run(
        `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, status,
           created_at, updated_at, decided_at, created_by_device, updated_by_device)
         VALUES ('x', 'inconnue', 't1', ?, '2026-10-01', 'missed', ?, ?, ?, ?, ?)`,
        [MILO, CREE, CREE, CREE, APPAREIL, APPAREIL],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })

  it('refuse une prise sans date de décision', async () => {
    await applyMigrations(db, 20)

    await expect(
      db.run(`UPDATE treatment_dose SET decided_at = NULL WHERE id = 'd1'`),
    ).rejects.toThrow(/NOT NULL constraint failed/)
  })
})
