// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ANIMAL_PHOTO_ENTITY } from '../schema-statements'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const APPAREIL = '99999999-9999-4999-8999-999999999999'
const SEPTEMBRE_1 = '2026-09-01T08:00:00.000Z'
const OCTOBRE_23 = '2026-10-23T08:00:00.000Z'
const OCTOBRE_24 = '2026-10-24T08:00:00.000Z'
const PHOTO_MILO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'

function insertMilo(db: InMemoryDb): Promise<number> {
  return db.run(
    `INSERT INTO animal (id, name, species, photo_path, created_at, updated_at,
       created_by_device, updated_by_device) VALUES ('milo', 'Milo', 'dog', ?, ?, ?, ?, ?)`,
    [PHOTO_MILO, SEPTEMBRE_1, SEPTEMBRE_1, APPAREIL, APPAREIL],
  )
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
  await applyMigrations(fresh, 22)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const outbox = (db: InMemoryDb) => db.query('SELECT * FROM sync_outbox ORDER BY entity, entity_id')

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v22, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
  })

  afterEach(() => {
    db.close()
  })

  it('porte une base v21 en version 22, au schéma exact d’une installation neuve, carnet intact', async () => {
    await applyMigrations(db, 21)
    await insertMilo(db)
    const animalsBefore = await db.query('SELECT * FROM animal ORDER BY id')

    await applyMigrations(db, 22)

    expect(await userVersion(db)).toBe(22)
    expect(await schema(db)).toEqual(await freshSchema())
    await expect(db.query('SELECT * FROM animal ORDER BY id')).resolves.toEqual(animalsBefore)
  })

  it('garde chaque entrée en file, photo comprise, avec sa date et ses essais, aucune refusée', async () => {
    await applyMigrations(db, 21)
    await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
    await insertMilo(db)
    await db.run(
      `UPDATE sync_outbox SET attempts = 2, queued_at = ?
       WHERE entity = '${ANIMAL_PHOTO_ENTITY}'`,
      [OCTOBRE_23],
    )

    await applyMigrations(db, 22)

    await expect(outbox(db)).resolves.toEqual([
      {
        entity: 'animal',
        entity_id: 'milo',
        queued_at: SEPTEMBRE_1,
        attempts: 0,
        refused_at: null,
      },
      {
        entity: ANIMAL_PHOTO_ENTITY,
        entity_id: PHOTO_MILO,
        queued_at: OCTOBRE_23,
        attempts: 2,
        refused_at: null,
      },
    ])
  })

  it('les modifications suivantes repartent en file comme avant la mise à niveau', async () => {
    await applyMigrations(db, 21)
    await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
    await insertMilo(db)
    await db.execute('DELETE FROM sync_outbox')

    await applyMigrations(db, 22)
    await db.run("UPDATE animal SET name = 'Milou', updated_at = ? WHERE id = 'milo'", [OCTOBRE_24])

    await expect(outbox(db)).resolves.toEqual([
      { entity: 'animal', entity_id: 'milo', queued_at: OCTOBRE_24, attempts: 0, refused_at: null },
    ])
  })

  it('ne met rien en file sur une file vide', async () => {
    await applyMigrations(db, 21)

    await applyMigrations(db, 22)

    await expect(outbox(db)).resolves.toEqual([])
  })
})
