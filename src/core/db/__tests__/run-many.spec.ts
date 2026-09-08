// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from './in-memory-db'

const NOW = '2026-09-08T10:00:00.000Z'

const INSERT_ANIMAL = `INSERT INTO animal (id, name, species, created_at, updated_at)
  VALUES (?, ?, 'dog', '${NOW}', '${NOW}')`

const INSERT_VACCINATION = `INSERT INTO vaccination (id, animal_id, name, last_injection_date, created_at, updated_at)
  VALUES (?, ?, ?, '2026-01-15', '${NOW}', '${NOW}')`

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('la promesse a abouti alors qu’un rejet était attendu')
}

describe('runMany', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.run(INSERT_ANIMAL, ['animal-1', 'Vasco'])
    await db.run(INSERT_VACCINATION, ['vaccin-1', 'animal-1', 'Rage'])
  })

  afterEach(() => {
    db.close()
  })

  it('applique un lot portant sur deux tables', async () => {
    await db.runMany([
      { sql: 'UPDATE animal SET deleted_at = ? WHERE id = ?', params: [NOW, 'animal-1'] },
      {
        sql: 'UPDATE vaccination SET deleted_at = ? WHERE animal_id = ?',
        params: [NOW, 'animal-1'],
      },
    ])

    await expect(
      db.query('SELECT deleted_at FROM animal WHERE id = ?', ['animal-1']),
    ).resolves.toEqual([{ deleted_at: NOW }])
    await expect(
      db.query('SELECT deleted_at FROM vaccination WHERE id = ?', ['vaccin-1']),
    ).resolves.toEqual([{ deleted_at: NOW }])
  })

  it("n'écrit rien quand une instruction du lot échoue", async () => {
    const error = await rejection(
      db.runMany([
        { sql: 'UPDATE animal SET name = ? WHERE id = ?', params: ['Miette', 'animal-1'] },
        { sql: INSERT_VACCINATION, params: ['vaccin-2', 'animal-1', 'Leucose'] },
        { sql: INSERT_ANIMAL, params: ['animal-1', 'Doublon'] },
      ]),
    )

    expect(error.message).toMatch(/UNIQUE constraint failed/)
    expect(error.cause).toBeUndefined()

    await expect(db.query('SELECT name FROM animal WHERE id = ?', ['animal-1'])).resolves.toEqual([
      { name: 'Vasco' },
    ])
    await expect(db.query('SELECT id FROM vaccination')).resolves.toEqual([{ id: 'vaccin-1' }])
  })

  it("remonte l'échec du ROLLBACK, la cause d'origine attachée", async () => {
    // Le lot referme lui-même la transaction : seule façon de faire échouer le
    // ROLLBACK sans truquer le moteur.
    const error = await rejection(
      db.runMany([{ sql: 'COMMIT' }, { sql: INSERT_ANIMAL, params: ['animal-1', 'Doublon'] }]),
    )

    expect(error.message).toMatch(/cannot rollback/i)
    expect(error.cause).toBeInstanceOf(Error)
    expect((error.cause as Error).message).toMatch(/UNIQUE constraint failed/)
  })

  it('ne fait rien et ne lève pas sur un lot vide', async () => {
    await expect(db.runMany([])).resolves.toBeUndefined()
  })

  it('accepte une instruction sans paramètres', async () => {
    await db.runMany([{ sql: `UPDATE animal SET name = 'Nala'` }])

    await expect(db.query('SELECT name FROM animal WHERE id = ?', ['animal-1'])).resolves.toEqual([
      { name: 'Nala' },
    ])
  })
})
