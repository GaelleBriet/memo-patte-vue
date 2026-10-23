// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANIMAL_PHOTO_ENTITY } from '../schema-statements'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const APPAREIL = '99999999-9999-4999-8999-999999999999'
const SEPTEMBRE_1 = '2026-09-01T08:00:00.000Z'
const OCTOBRE_23_8H = '2026-10-23T08:00:00.000Z'
const DECEMBRE_1 = '2026-12-01T08:00:00.000Z'
const PHOTO_MILO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const PHOTO_PIRATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
const PHOTO_ILLISIBLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'

function insertMilo(db: InMemoryDb): Promise<number> {
  return db.run(
    `INSERT INTO animal (id, name, species, photo_path, created_at, updated_at,
       created_by_device, updated_by_device) VALUES ('milo', 'Milo', 'dog', ?, ?, ?, ?, ?)`,
    [PHOTO_MILO, SEPTEMBRE_1, SEPTEMBRE_1, APPAREIL, APPAREIL],
  )
}

function queue(db: InMemoryDb, entity: string, entityId: string, queuedAt: string, attempts = 0) {
  return db.run(
    `INSERT OR REPLACE INTO sync_outbox (entity, entity_id, queued_at, attempts)
     VALUES (?, ?, ?, ?)`,
    [entity, entityId, queuedAt, attempts],
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
  await applyMigrations(fresh, 21)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const outbox = (db: InMemoryDb) =>
  db.query(
    'SELECT entity, entity_id, queued_at, attempts FROM sync_outbox ORDER BY entity, entity_id',
  )

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v21, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(OCTOBRE_23_8H) })
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('porte une base v20 en version 21, au schéma exact d’une installation neuve, carnet intact', async () => {
    await applyMigrations(db, 20)
    await insertMilo(db)
    const animalsBefore = await db.query('SELECT * FROM animal ORDER BY id')

    await applyMigrations(db, 21)

    expect(await userVersion(db)).toBe(21)
    expect(await schema(db)).toEqual(await freshSchema())
    await expect(db.query('SELECT * FROM animal ORDER BY id')).resolves.toEqual(animalsBefore)
  })

  it('date chaque photo en file à l’heure de la mise à niveau, essais gardés ; jamais plus tôt, ni une date illisible, ni une ligne du carnet', async () => {
    await applyMigrations(db, 20)
    await queue(db, 'animal', 'milo', SEPTEMBRE_1, 1)
    await queue(db, ANIMAL_PHOTO_ENTITY, PHOTO_MILO, SEPTEMBRE_1, 2)
    await queue(db, ANIMAL_PHOTO_ENTITY, PHOTO_PIRATE, DECEMBRE_1)
    await queue(db, ANIMAL_PHOTO_ENTITY, PHOTO_ILLISIBLE, 'pas une date')

    await applyMigrations(db, 21)

    await expect(outbox(db)).resolves.toEqual([
      { entity: 'animal', entity_id: 'milo', queued_at: SEPTEMBRE_1, attempts: 1 },
      { entity: ANIMAL_PHOTO_ENTITY, entity_id: PHOTO_MILO, queued_at: OCTOBRE_23_8H, attempts: 2 },
      { entity: ANIMAL_PHOTO_ENTITY, entity_id: PHOTO_PIRATE, queued_at: DECEMBRE_1, attempts: 0 },
      {
        entity: ANIMAL_PHOTO_ENTITY,
        entity_id: PHOTO_ILLISIBLE,
        queued_at: 'pas une date',
        attempts: 0,
      },
    ])
  })

  it('Milo modifié le 1er septembre, téléphone en v17 synchro active, mis à niveau le 23 octobre à 8 h : sa photo entre en file à 8 h, pas le 1er septembre', async () => {
    await applyMigrations(db, 17)
    await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
    await insertMilo(db)
    await db.execute('DELETE FROM sync_outbox')

    await applyMigrations(db)

    await expect(outbox(db)).resolves.toEqual([
      { entity: ANIMAL_PHOTO_ENTITY, entity_id: PHOTO_MILO, queued_at: OCTOBRE_23_8H, attempts: 0 },
    ])
  })

  it('ne met rien en file sur une file vide', async () => {
    await applyMigrations(db, 20)

    await applyMigrations(db, 21)

    await expect(outbox(db)).resolves.toEqual([])
  })
})
