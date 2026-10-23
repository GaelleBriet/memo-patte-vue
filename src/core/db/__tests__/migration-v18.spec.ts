// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ANIMAL_PHOTO_ENTITY } from '../schema-statements'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const APPAREIL = '99999999-9999-4999-8999-999999999999'
const CREE = '2026-10-02T08:00:00.000Z'
const MODIFIE = '2026-10-04T08:00:00.000Z'
const PHOTO_MILO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const PHOTO_PIRATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
const PHOTO_NOUVELLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'

// Identifiant, nom, photo, suppression.
const ANIMALS: [string, string, string | null, string | null][] = [
  ['milo', 'Milo', PHOTO_MILO, null],
  ['luna', 'Luna', null, null],
  ['pirate', 'Pirate', PHOTO_PIRATE, MODIFIE],
]

function seedVersion17(db: InMemoryDb, syncEnabled: boolean): Promise<void> {
  return db.runMany([
    { sql: 'UPDATE sync_state SET enabled = ? WHERE id = 1', params: [syncEnabled ? 1 : 0] },
    ...ANIMALS.map(([id, name, photoPath, deletedAt]) => ({
      sql: `INSERT INTO animal (id, name, species, photo_path, created_at, updated_at, deleted_at,
              created_by_device, updated_by_device) VALUES (?, ?, 'dog', ?, ?, ?, ?, ?, ?)`,
      params: [id, name, photoPath, CREE, MODIFIE, deletedAt, APPAREIL, APPAREIL],
    })),
    { sql: 'DELETE FROM sync_outbox' },
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
  await applyMigrations(fresh, 18)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const outbox = (db: InMemoryDb) =>
  db.query('SELECT entity, entity_id, queued_at FROM sync_outbox ORDER BY entity, entity_id')

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v18 d’une base v17 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 17)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 18, au schéma exact d’une installation neuve, carnet intact', async () => {
    await seedVersion17(db, true)
    const animalsBefore = await db.query('SELECT * FROM animal ORDER BY id')

    await applyMigrations(db, 18)

    expect(await userVersion(db)).toBe(18)
    expect(await schema(db)).toEqual(await freshSchema())
    await expect(db.query('SELECT * FROM animal ORDER BY id')).resolves.toEqual(animalsBefore)
  })

  it('synchronisation active : met en file la photo de chaque animal non supprimé', async () => {
    await seedVersion17(db, true)

    await applyMigrations(db, 18)

    await expect(outbox(db)).resolves.toEqual([
      { entity: ANIMAL_PHOTO_ENTITY, entity_id: PHOTO_MILO, queued_at: MODIFIE },
    ])
  })

  it('synchronisation désactivée : ne met rien en file', async () => {
    await seedVersion17(db, false)

    await applyMigrations(db, 18)

    await expect(outbox(db)).resolves.toEqual([])
  })

  it('met en file une photo changée après la migration', async () => {
    await seedVersion17(db, true)
    await applyMigrations(db, 18)
    await db.execute('DELETE FROM sync_outbox')

    await db.run(`UPDATE animal SET photo_path = ?, updated_at = ? WHERE id = 'luna'`, [
      PHOTO_NOUVELLE,
      '2026-10-22T08:00:00.000Z',
    ])

    await expect(outbox(db)).resolves.toEqual([
      { entity: 'animal', entity_id: 'luna', queued_at: '2026-10-22T08:00:00.000Z' },
      {
        entity: ANIMAL_PHOTO_ENTITY,
        entity_id: PHOTO_NOUVELLE,
        queued_at: '2026-10-22T08:00:00.000Z',
      },
    ])
  })

  it('reste en version 17, file intacte, quand une instruction de la v18 échoue', async () => {
    await seedVersion17(db, true)
    await db.execute(
      'CREATE TRIGGER animal_photo_outbox_insert AFTER INSERT ON animal BEGIN SELECT 1; END;',
    )
    const schemaAvant = await schema(db)

    await expect(applyMigrations(db, 18)).rejects.toThrow(/already exists/)

    expect(await userVersion(db)).toBe(17)
    expect(await schema(db)).toEqual(schemaAvant)
    await expect(outbox(db)).resolves.toEqual([])
  })
})
