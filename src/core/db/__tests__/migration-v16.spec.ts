// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const MILO = '11111111-1111-4111-8111-111111111111'
const APPAREIL = '99999999-9999-4999-8999-999999999999'
const AUTRE = '88888888-8888-4888-8888-888888888888'
const T1 = '2026-10-02T08:00:00.000Z'
const SUPPRIME = '2026-10-05T08:00:00.000Z'

const PERIODS: [string, string | null][] = [
  ['p1', '08:00,14:00,20:00'],
  ['p2', null],
  ['p3', '06:00,12:00,18:00,23:00'],
  ['p4', '20:00,08:00'],
]

type Dose = [string, string, string, string | null, string, string | null, string | null]

// Identifiant, réglage, échéance, heure, état, date réelle, arrivée ou ancrage.
const DOSES: Dose[] = [
  ['d1', 'p1', '2026-10-03', '08:00', 'given', '2026-10-03', null],
  ['d2', 'p1', '2026-10-06', '14:00', 'postponed', null, '2026-10-07'],
  ['d3', 'p1', '2026-10-06', '14:00', 'shift', null, '2026-10-07'],
  ['d4', 'p1', '2026-10-09', '09:00', 'postponed', null, '2026-10-10'],
  ['d5', 'p2', '2026-10-11', null, 'postponed', null, '2026-10-12'],
  ['d6', 'p3', '2026-10-13', '23:00', 'postponed', null, '2026-10-14'],
  ['d7', 'p3', '2026-10-16', '06:00', 'postponed', null, '2026-10-17'],
  ['d8', 'p4', '2026-10-18', '08:00', 'postponed', null, '2026-10-19'],
  ['d9', 'p4', '2026-10-20', '20:00', 'postponed', null, '2026-10-21'],
]

function seedVersion15(db: InMemoryDb): Promise<void> {
  const by = [APPAREIL, AUTRE]
  return db.runMany([
    { sql: 'UPDATE sync_state SET enabled = 1 WHERE id = 1' },
    {
      sql: `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device,
              updated_by_device) VALUES (?, 'Milo', 'dog', ?, ?, ?, ?)`,
      params: [MILO, T1, T1, ...by],
    },
    {
      sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at,
              created_by_device, updated_by_device) VALUES ('t1', ?, 'Metacam', 'medication', ?, ?, ?, ?)`,
      params: [MILO, T1, T1, ...by],
    },
    ...PERIODS.map(([id, times], index) => ({
      sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
              grid_origin_on, first_due_chosen, fallen_doses_answer, frequency_value, frequency_unit,
              times, created_at, updated_at, settings_written_at, created_by_device,
              updated_by_device)
            VALUES (?, 't1', ?, ?, ?, ?, 1, 'unasked', 1, 'day', ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        MILO,
        `2026-10-0${index + 1}`,
        `2026-10-0${index + 1}`,
        `2026-10-0${index + 1}`,
        times,
        T1,
        T1,
        T1,
        ...by,
      ],
    })),
    ...DOSES.map(([id, periodId, dueOn, dueTime, status, givenOn, targetOn]) => ({
      sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
              given_on, status, target_on, created_at, updated_at, deleted_at,
              created_by_device, updated_by_device)
            VALUES (?, ?, 't1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        periodId,
        MILO,
        dueOn,
        dueTime,
        givenOn,
        status,
        targetOn,
        T1,
        T1,
        id === 'd6' ? SUPPRIME : null,
        ...by,
      ],
    })),
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
  await applyMigrations(fresh, 16)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const rows = (db: InMemoryDb, table: string) =>
  db.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY id`)

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v16 d’une base v15 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 15)
    await seedVersion15(db)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 16, au schéma exact d’une installation neuve', async () => {
    await applyMigrations(db, 16)

    expect(await userVersion(db)).toBe(16)
    expect(await schema(db)).toEqual(await freshSchema())
  })

  it('garde chaque autre colonne des lignes et les réglages, appareils, dates et suppressions compris', async () => {
    const periodsBefore = await rows(db, 'treatment_period')
    const dosesBefore = await rows(db, 'treatment_dose')

    await applyMigrations(db, 16)

    const without = (row: Record<string, unknown>) => {
      const kept = { ...row }
      delete kept.previous_target_on
      delete kept.previous_target_time
      delete kept.due_rank
      return kept
    }
    expect((await rows(db, 'treatment_dose')).map(without)).toEqual(dosesBefore)
    expect(await rows(db, 'treatment_period')).toEqual(periodsBefore)
  })

  it('l’ancienne arrivée d’un report est inconnue ; son rang se lit dans les heures de son réglage, dans l’ordre de la journée', async () => {
    await applyMigrations(db, 16)

    await expect(
      db.query(
        `SELECT id, previous_target_on, previous_target_time, due_rank FROM treatment_dose
         ORDER BY id`,
      ),
    ).resolves.toEqual([
      { id: 'd1', previous_target_on: null, previous_target_time: null, due_rank: null },
      { id: 'd2', previous_target_on: null, previous_target_time: null, due_rank: 2 },
      { id: 'd3', previous_target_on: null, previous_target_time: null, due_rank: null },
      { id: 'd4', previous_target_on: null, previous_target_time: null, due_rank: null },
      { id: 'd5', previous_target_on: null, previous_target_time: null, due_rank: 1 },
      { id: 'd6', previous_target_on: null, previous_target_time: null, due_rank: 4 },
      { id: 'd7', previous_target_on: null, previous_target_time: null, due_rank: 1 },
      { id: 'd8', previous_target_on: null, previous_target_time: null, due_rank: 1 },
      { id: 'd9', previous_target_on: null, previous_target_time: null, due_rank: 2 },
    ])
  })

  it('n’envoie rien à la synchronisation : la migration Supabase pose les mêmes valeurs', async () => {
    await db.execute('DELETE FROM sync_outbox')

    await applyMigrations(db, 16)

    await expect(db.query('SELECT * FROM sync_outbox')).resolves.toEqual([])
  })

  it('met de nouveau en file d’envoi une ligne écrite après la migration', async () => {
    await applyMigrations(db, 16)
    await db.execute('DELETE FROM sync_outbox')

    await db.run(
      `UPDATE treatment_dose SET target_on = '2026-10-08', previous_target_on = '2026-10-07',
         previous_target_time = '14:00', updated_at = ? WHERE id = 'd2'`,
      ['2026-10-19T08:00:00.000Z'],
    )
    await db.run(
      `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time, status,
         target_on, due_rank, created_at, updated_at, created_by_device, updated_by_device)
       VALUES ('d10', 'p1', 't1', ?, '2026-10-22', '20:00', 'postponed', '2026-10-23', 3, ?, ?, ?, ?)`,
      [MILO, T1, T1, APPAREIL, APPAREIL],
    )

    await expect(
      db.query('SELECT entity, entity_id FROM sync_outbox ORDER BY entity_id'),
    ).resolves.toEqual([
      { entity: 'treatment_dose', entity_id: 'd10' },
      { entity: 'treatment_dose', entity_id: 'd2' },
    ])
  })

  it('reste en version 15, carnet intact, quand une instruction de la v16 échoue', async () => {
    await db.execute('CREATE VIEW treatment_dose_v15 AS SELECT 1 AS id')
    const schemaAvant = await schema(db)
    const dosesAvant = await rows(db, 'treatment_dose')

    await expect(applyMigrations(db, 16)).rejects.toThrow(/already exists/)

    expect(await userVersion(db)).toBe(15)
    expect(await schema(db)).toEqual(schemaAvant)
    await expect(rows(db, 'treatment_dose')).resolves.toEqual(dosesAvant)
  })

  it('laisse des clés étrangères cohérentes et actives', async () => {
    await applyMigrations(db, 16)
    await db.execute('PRAGMA foreign_keys = ON')

    await expect(db.query('PRAGMA foreign_key_check')).resolves.toEqual([])
    await expect(
      db.run(
        `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, status,
           created_at, updated_at, created_by_device, updated_by_device)
         VALUES ('x', 'inconnue', 't1', ?, '2026-10-01', 'missed', ?, ?, ?, ?)`,
        [MILO, T1, T1, APPAREIL, APPAREIL],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })

  it('refuse un rang nul ou négatif et un état inconnu', async () => {
    await applyMigrations(db, 16)

    await expect(db.run(`UPDATE treatment_dose SET due_rank = 0 WHERE id = 'd2'`)).rejects.toThrow(
      /CHECK constraint failed/,
    )
    await expect(
      db.run(`UPDATE treatment_dose SET status = 'skipped' WHERE id = 'd2'`),
    ).rejects.toThrow(/CHECK constraint failed/)
  })
})
