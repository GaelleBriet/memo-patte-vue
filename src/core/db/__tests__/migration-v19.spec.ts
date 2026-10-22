// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ANIMAL_PHOTO_ENTITY } from '../schema-statements'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const APPAREIL = '99999999-9999-4999-8999-999999999999'
const CREE = '2026-10-02T08:00:00.000Z'
const MODIFIE = '2026-10-04T08:00:00.000Z'
const REMPLACEE = '2026-10-23T08:00:00.000Z'
const PHOTO_MILO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const PHOTO_NOUVELLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'

function seedVersion18(db: InMemoryDb): Promise<void> {
  return db.runMany([
    { sql: 'UPDATE sync_state SET enabled = 1 WHERE id = 1' },
    {
      sql: `INSERT INTO animal (id, name, species, photo_path, created_at, updated_at,
              created_by_device, updated_by_device) VALUES ('milo', 'Milo', 'dog', ?, ?, ?, ?, ?)`,
      params: [PHOTO_MILO, CREE, MODIFIE, APPAREIL, APPAREIL],
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
  await applyMigrations(fresh, 19)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const outbox = (db: InMemoryDb) =>
  db.query('SELECT entity, entity_id, queued_at FROM sync_outbox ORDER BY entity, entity_id')

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v19 d’une base v18 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 18)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 19, au schéma exact d’une installation neuve, carnet et file intacts', async () => {
    await seedVersion18(db)
    const animalsBefore = await db.query('SELECT * FROM animal ORDER BY id')
    const outboxBefore = await outbox(db)

    await applyMigrations(db, 19)

    expect(await userVersion(db)).toBe(19)
    expect(await schema(db)).toEqual(await freshSchema())
    await expect(db.query('SELECT * FROM animal ORDER BY id')).resolves.toEqual(animalsBefore)
    await expect(outbox(db)).resolves.toEqual(outboxBefore)
  })

  it('remet en file la photo remplacée après la migration', async () => {
    await seedVersion18(db)
    await applyMigrations(db, 19)
    await db.execute('DELETE FROM sync_outbox')

    await db.run(`UPDATE animal SET photo_path = ?, updated_at = ? WHERE id = 'milo'`, [
      PHOTO_NOUVELLE,
      REMPLACEE,
    ])

    await expect(outbox(db)).resolves.toEqual([
      { entity: 'animal', entity_id: 'milo', queued_at: REMPLACEE },
      { entity: ANIMAL_PHOTO_ENTITY, entity_id: PHOTO_MILO, queued_at: REMPLACEE },
      { entity: ANIMAL_PHOTO_ENTITY, entity_id: PHOTO_NOUVELLE, queued_at: REMPLACEE },
    ])
  })

  it('reste en version 18 quand une instruction de la v19 échoue', async () => {
    await seedVersion18(db)
    await db.execute(
      'CREATE TRIGGER animal_photo_outbox_replaced AFTER UPDATE ON animal BEGIN SELECT 1; END;',
    )
    const schemaAvant = await schema(db)

    await expect(applyMigrations(db, 19)).rejects.toThrow(/already exists/)

    expect(await userVersion(db)).toBe(18)
    expect(await schema(db)).toEqual(schemaAvant)
  })
})
