// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DATABASE_VERSION, migrations } from '../migrations'
import { applyMigrations, createSqlJsDbClient } from './in-memory-db'

interface TableInfoRow {
  name: string
  type: string
  notnull: number
  pk: number
}

async function tableColumns(db: Awaited<ReturnType<typeof createSqlJsDbClient>>, table: string) {
  const rows = await db.query<TableInfoRow>(`PRAGMA table_info(${table})`)
  return new Map(rows.map((row) => [row.name, row]))
}

describe('migrations', () => {
  it('numérote les versions de façon strictement croissante à partir de 1', () => {
    expect(migrations.map((migration) => migration.toVersion)).toEqual(
      migrations.map((_, index) => index + 1),
    )
    expect(DATABASE_VERSION).toBe(migrations.length)
  })

  it('crée la table animal sur une base vide', async () => {
    const db = await createSqlJsDbClient()

    await applyMigrations(db)

    const columns = await tableColumns(db, 'animal')
    expect([...columns.keys()]).toEqual([
      'id',
      'name',
      'species',
      'breed',
      'birth_date',
      'initial_weight_kg',
      'photo_path',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
    expect(columns.get('id')?.pk).toBe(1)
    expect(columns.get('name')?.notnull).toBe(1)
    expect(columns.get('species')?.notnull).toBe(1)
    expect(columns.get('created_at')?.notnull).toBe(1)
    expect(columns.get('updated_at')?.notnull).toBe(1)
    expect(columns.get('initial_weight_kg')?.type).toBe('REAL')
    expect(columns.get('breed')?.notnull).toBe(0)
    // Suppression logique : la colonne doit rester nullable (NULL = animal vivant).
    expect(columns.get('deleted_at')?.notnull).toBe(0)
    expect(columns.get('deleted_at')?.type).toBe('TEXT')

    db.close()
  })

  it('porte la base à la version courante et ne rejoue rien au second appel', async () => {
    const db = await createSqlJsDbClient()

    await applyMigrations(db)
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['a1', 'Miette', 'cat', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
    )

    await applyMigrations(db)

    const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(DATABASE_VERSION)
    const rows = await db.query<{ id: string }>('SELECT id FROM animal')
    expect(rows).toHaveLength(1)

    db.close()
  })

  it('refuse une espèce hors chien/chat au niveau SQL', async () => {
    const db = await createSqlJsDbClient()
    await applyMigrations(db)

    await expect(
      db.run(
        `INSERT INTO animal (id, name, species, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['a1', 'Nemo', 'fish', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
      ),
    ).rejects.toThrow(/CHECK constraint failed/)

    db.close()
  })
})
