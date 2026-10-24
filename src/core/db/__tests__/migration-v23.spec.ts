// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const APPAREIL = '99999999-9999-4999-8999-999999999999'
const SEPTEMBRE_1 = new Date(2026, 8, 1, 8).toISOString()
const OCTOBRE_21_8_15 = new Date(2026, 9, 21, 8, 15).toISOString()
const OCTOBRE_21_8_30 = new Date(2026, 9, 21, 8, 30).toISOString()
const OCTOBRE_21_9 = new Date(2026, 9, 21, 9).toISOString()

async function insertMiloWithWeighings(db: InMemoryDb): Promise<void> {
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device,
       updated_by_device) VALUES ('milo', 'Milo', 'dog', ?, ?, ?, ?)`,
    [SEPTEMBRE_1, SEPTEMBRE_1, APPAREIL, APPAREIL],
  )
  for (const id of ['w-1', 'w-2']) {
    await db.run(
      `INSERT INTO weight_entry (id, animal_id, measured_on, weight_kg, created_at, updated_at,
         created_by_device, updated_by_device) VALUES (?, 'milo', '2026-10-21', 9.9, ?, ?, ?, ?)`,
      [id, OCTOBRE_21_8_30, OCTOBRE_21_8_30, APPAREIL, APPAREIL],
    )
  }
}

async function schema(db: InMemoryDb) {
  return db.query<{ type: string; name: string; tbl_name: string; sql: string }>(
    `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
  )
}

async function freshSchema() {
  const fresh = await createSqlJsDbClient()
  await applyMigrations(fresh, 23)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

async function everyTableButOutbox(db: InMemoryDb) {
  const tables = await db.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       AND name <> 'sync_outbox' ORDER BY name`,
  )
  const rows: Record<string, unknown[]> = {}
  for (const { name } of tables) rows[name] = await db.query(`SELECT * FROM ${name} ORDER BY rowid`)
  return rows
}

const outbox = (db: InMemoryDb) =>
  db.query<{
    entity: string
    entity_id: string
    queued_at: string
    attempts: number
    refused_at: string | null
    refused_reason: string | null
  }>('SELECT * FROM sync_outbox ORDER BY entity, entity_id')

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v23, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 22)
    await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
    await insertMiloWithWeighings(db)
    await db.run(
      "UPDATE sync_outbox SET refused_at = ?, attempts = 3 WHERE entity_id IN ('milo', 'w-1')",
      [OCTOBRE_21_8_15],
    )
    await db.run("UPDATE sync_outbox SET attempts = 1 WHERE entity_id = 'w-2'")
  })

  afterEach(() => {
    db.close()
  })

  it('porte une base v22 en version 23, au schéma exact d’une installation neuve, carnet intact', async () => {
    const carnetBefore = await everyTableButOutbox(db)

    await applyMigrations(db, 23)

    const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(23)
    expect(await schema(db)).toEqual(await freshSchema())
    expect(await everyTableButOutbox(db)).toEqual(carnetBefore)
    await expect(db.query('PRAGMA integrity_check')).resolves.toEqual([{ integrity_check: 'ok' }])
  })

  it('garde chaque entrée, sa date et ses essais ; une marque posée par la v22 devient « own »', async () => {
    await applyMigrations(db, 23)

    await expect(outbox(db)).resolves.toEqual([
      {
        entity: 'animal',
        entity_id: 'milo',
        queued_at: SEPTEMBRE_1,
        attempts: 3,
        refused_at: OCTOBRE_21_8_15,
        refused_reason: 'own',
      },
      {
        entity: 'weight_entry',
        entity_id: 'w-1',
        queued_at: OCTOBRE_21_8_30,
        attempts: 3,
        refused_at: OCTOBRE_21_8_15,
        refused_reason: 'own',
      },
      {
        entity: 'weight_entry',
        entity_id: 'w-2',
        queued_at: OCTOBRE_21_8_30,
        attempts: 1,
        refused_at: null,
        refused_reason: null,
      },
    ])
  })

  it('Milo remis en file ou sorti de la file : la pesée marquée par la v22 garde sa marque', async () => {
    await applyMigrations(db, 23)

    await db.run("UPDATE animal SET name = 'Milou', updated_at = ? WHERE id = 'milo'", [
      OCTOBRE_21_9,
    ])
    await db.run("DELETE FROM sync_outbox WHERE entity = 'animal' AND entity_id = 'milo'")

    const [weighing] = (await outbox(db)).filter(({ entity_id }) => entity_id === 'w-1')
    expect(weighing).toMatchObject({ refused_at: OCTOBRE_21_8_15, refused_reason: 'own' })
  })

  it('les modifications suivantes repartent en file comme avant la mise à niveau', async () => {
    await applyMigrations(db, 23)

    await db.run('UPDATE weight_entry SET weight_kg = 10, updated_at = ? WHERE id = ?', [
      OCTOBRE_21_9,
      'w-1',
    ])

    const [weighing] = (await outbox(db)).filter(({ entity_id }) => entity_id === 'w-1')
    expect(weighing).toMatchObject({
      queued_at: OCTOBRE_21_9,
      refused_at: null,
      refused_reason: null,
    })
  })
})
