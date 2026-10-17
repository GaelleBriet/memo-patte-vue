// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const MILO = '11111111-1111-4111-8111-111111111111'
const APPAREIL = '99999999-9999-4999-8999-999999999999'
const AUTRE = '88888888-8888-4888-8888-888888888888'
const T1 = '2026-10-02T08:00:00.000Z'
const SUPPRIME = '2026-10-05T08:00:00.000Z'

type V13Period = {
  id: string
  treatmentId: string
  startsOn: string
  firstDueOn: string
  gridOriginOn: string | null
  firstDueChosen: 0 | 1
  pastDosesStayUnlogged: 0 | 1
  stoppedOn?: string | null
  deletedAt?: string | null
}

const PERIODS: V13Period[] = [
  {
    id: 'p1',
    treatmentId: 't1',
    startsOn: '2026-10-03',
    firstDueOn: '2026-10-03',
    gridOriginOn: '2026-10-03',
    firstDueChosen: 1,
    pastDosesStayUnlogged: 0,
  },
  {
    id: 'p2',
    treatmentId: 't1',
    startsOn: '2026-10-07',
    firstDueOn: '2026-10-09',
    gridOriginOn: null,
    firstDueChosen: 0,
    pastDosesStayUnlogged: 1,
  },
  {
    id: 'p3',
    treatmentId: 't1',
    startsOn: '2026-10-08',
    firstDueOn: '2026-10-10',
    gridOriginOn: '2026-10-10',
    firstDueChosen: 1,
    pastDosesStayUnlogged: 0,
    stoppedOn: '2026-10-12',
  },
  {
    id: 'p4',
    treatmentId: 't2',
    startsOn: '2026-10-01',
    firstDueOn: '2026-10-01',
    gridOriginOn: '2026-10-01',
    firstDueChosen: 1,
    pastDosesStayUnlogged: 0,
    deletedAt: SUPPRIME,
  },
]

const createdAtOf = (index: number) => `2026-10-0${index + 1}T08:00:00.000Z`

function seedVersion13(db: InMemoryDb): Promise<void> {
  const by = [APPAREIL, AUTRE]
  return db.runMany([
    { sql: 'UPDATE sync_state SET enabled = 1 WHERE id = 1' },
    {
      sql: `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device,
              updated_by_device) VALUES (?, 'Milo', 'dog', ?, ?, ?, ?)`,
      params: [MILO, T1, T1, ...by],
    },
    ...['t1', 't2'].map((id) => ({
      sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at,
              created_by_device, updated_by_device) VALUES (?, ?, 'Metacam', 'medication', ?, ?, ?, ?)`,
      params: [id, MILO, T1, T1, ...by],
    })),
    ...PERIODS.map((period, index) => ({
      sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
              grid_origin_on, first_due_chosen, past_doses_stay_unlogged, ends_on, stopped_on,
              frequency_value, frequency_unit, times, dose_quantity, dose_unit,
              reminder_offset_minutes, reminder_time, created_at, updated_at, deleted_at,
              created_by_device, updated_by_device)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-12-31', ?, 3, 'day', '08:00,20:00', 0.5, 'tablet',
              15, NULL, ?, ?, ?, ?, ?)`,
      params: [
        period.id,
        period.treatmentId,
        MILO,
        period.startsOn,
        period.firstDueOn,
        period.gridOriginOn,
        period.firstDueChosen,
        period.pastDosesStayUnlogged,
        period.stoppedOn ?? null,
        createdAtOf(index),
        `2026-10-0${index + 2}T08:00:00.000Z`,
        period.deletedAt ?? null,
        ...by,
      ],
    })),
    ...(
      [
        ['d1', 'p1', 't1', '2026-10-03', '08:00', 'given', '2026-10-03', null],
        ['d2', 'p1', 't1', '2026-10-06', '08:00', 'postponed', null, '2026-10-07'],
        ['d3', 'p3', 't1', '2026-10-10', '20:00', 'missed', null, null],
        ['d4', 'p4', 't2', '2026-10-01', '08:00', 'given', '2026-10-02', null],
      ] as [string, string, string, string, string, string, string | null, string | null][]
    ).map(([id, periodId, treatmentId, dueOn, dueTime, status, givenOn, targetOn]) => ({
      sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
              given_on, status, target_on, created_at, updated_at, deleted_at,
              created_by_device, updated_by_device)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        periodId,
        treatmentId,
        MILO,
        dueOn,
        dueTime,
        givenOn,
        status,
        targetOn,
        T1,
        T1,
        treatmentId === 't2' ? SUPPRIME : null,
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
  await applyMigrations(fresh, 14)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const rows = (db: InMemoryDb, table: string) => db.query(`SELECT * FROM ${table} ORDER BY id`)

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v14 d’une base v13 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 13)
    await seedVersion13(db)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 14, au schéma exact d’une installation neuve', async () => {
    await applyMigrations(db, 14)

    expect(await userVersion(db)).toBe(14)
    expect(await schema(db)).toEqual(await freshSchema())
  })

  it('garde chaque colonne des réglages et des lignes, appareils et suppressions compris', async () => {
    const periodsBefore = await rows(db, 'treatment_period')
    const dosesBefore = await rows(db, 'treatment_dose')

    await applyMigrations(db, 14)

    const periodsAfter = (await rows(db, 'treatment_period')) as Record<string, unknown>[]
    const withoutWrittenAt = periodsAfter.map((row) => {
      const kept = { ...row }
      delete kept.settings_written_at
      return kept
    })
    expect(withoutWrittenAt).toEqual(periodsBefore)
    expect(await rows(db, 'treatment_dose')).toEqual(dosesBefore)
  })

  it('date l’écriture de chaque réglage à sa création : date inconnue, lue comme avant', async () => {
    await applyMigrations(db, 14)

    await expect(
      db.query('SELECT id, settings_written_at FROM treatment_period ORDER BY id'),
    ).resolves.toEqual(
      PERIODS.map(({ id }, index) => ({ id, settings_written_at: createdAtOf(index) })),
    )
  })

  it('n’envoie rien à la synchronisation : la migration Supabase pose les mêmes valeurs', async () => {
    await db.execute('DELETE FROM sync_outbox')

    await applyMigrations(db, 14)

    await expect(db.query('SELECT * FROM sync_outbox')).resolves.toEqual([])
  })

  it('met de nouveau en file d’envoi une ligne écrite après la migration', async () => {
    await applyMigrations(db, 14)
    await db.execute('DELETE FROM sync_outbox')

    await db.run(
      `UPDATE treatment_period SET settings_written_at = ?, updated_at = ? WHERE id = 'p1'`,
      ['2026-10-17T08:00:00.000Z', '2026-10-17T08:00:00.000Z'],
    )
    await db.run(`UPDATE treatment_dose SET updated_at = ? WHERE id = 'd1'`, [
      '2026-10-17T08:00:00.000Z',
    ])

    await expect(
      db.query('SELECT entity, entity_id FROM sync_outbox ORDER BY entity'),
    ).resolves.toEqual([
      { entity: 'treatment_dose', entity_id: 'd1' },
      { entity: 'treatment_period', entity_id: 'p1' },
    ])
  })

  it('reste en version 13, carnet intact, quand une instruction de la v14 échoue', async () => {
    await db.execute('CREATE VIEW treatment_dose_v13 AS SELECT 1 AS id')
    const schemaAvant = await schema(db)
    const periodsAvant = await rows(db, 'treatment_period')
    const dosesAvant = await rows(db, 'treatment_dose')

    await expect(applyMigrations(db, 14)).rejects.toThrow(/already exists/)

    expect(await userVersion(db)).toBe(13)
    expect(await schema(db)).toEqual(schemaAvant)
    await expect(rows(db, 'treatment_period')).resolves.toEqual(periodsAvant)
    await expect(rows(db, 'treatment_dose')).resolves.toEqual(dosesAvant)
  })

  it('laisse des clés étrangères cohérentes et actives', async () => {
    await applyMigrations(db, 14)
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

  it('garde le contrôle des unités de dose et les deux faits du réglage', async () => {
    await applyMigrations(db, 14)

    await expect(
      db.run(`UPDATE treatment_period SET dose_unit = 'cuillère' WHERE id = 'p1'`),
    ).rejects.toThrow(/dose_unit not allowed/)
    await expect(
      db.run(`UPDATE treatment_period SET first_due_chosen = 2 WHERE id = 'p1'`),
    ).rejects.toThrow(/CHECK constraint failed/)
  })
})

describe('schéma v14 sur une installation neuve', () => {
  it('refuse un réglage sans date d’écriture', async () => {
    const db = await createSqlJsDbClient()
    await applyMigrations(db, 14)

    await expect(seedVersion13(db)).rejects.toThrow(/NOT NULL constraint failed/)
    db.close()
  })
})
