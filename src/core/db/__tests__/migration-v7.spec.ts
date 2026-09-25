// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const MILO = '11111111-1111-4111-8111-111111111111'
const T1 = '2026-01-10T08:00:00.000Z'

describe('migration v7 : un curseur de pull par entité', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute('PRAGMA foreign_keys = ON')
    await applyMigrations(db, 6)
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES (?, 'Milo', 'dog', ?, ?)`,
      [MILO, T1, T1],
    )
    await db.run('UPDATE sync_state SET enabled = 1, last_pulled_at = ? WHERE id = 1', [T1])
  })

  afterEach(() => {
    db.close()
  })

  it('crée une table de curseurs vide : chaque entité repart d’un pull complet', async () => {
    await applyMigrations(db)

    await expect(db.query('SELECT entity FROM sync_pull_cursor')).resolves.toEqual([])
    const columns = await db.query<{ name: string; pk: number; notnull: number }>(
      'PRAGMA table_info(sync_pull_cursor)',
    )
    expect(columns.map(({ name, pk, notnull }) => ({ name, pk, notnull }))).toEqual([
      { name: 'entity', pk: 1, notnull: 1 },
      { name: 'last_pulled_at', pk: 0, notnull: 1 },
    ])
  })

  it('ne touche ni aux données ni à l’état de la synchronisation', async () => {
    await applyMigrations(db)

    await expect(db.query('SELECT id FROM animal')).resolves.toEqual([{ id: MILO }])
    await expect(db.query('SELECT enabled FROM sync_state WHERE id = 1')).resolves.toEqual([
      { enabled: 1 },
    ])
  })
})
