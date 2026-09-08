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

  it('crée la table vaccination rattachée à animal', async () => {
    const db = await createSqlJsDbClient()

    await applyMigrations(db)

    const columns = await tableColumns(db, 'vaccination')
    expect([...columns.keys()]).toEqual([
      'id',
      'animal_id',
      'name',
      'last_injection_date',
      'due_date',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
    expect(columns.get('id')?.pk).toBe(1)
    expect(columns.get('animal_id')?.notnull).toBe(1)
    expect(columns.get('name')?.notnull).toBe(1)
    expect(columns.get('last_injection_date')?.notnull).toBe(1)
    expect(columns.get('created_at')?.notnull).toBe(1)
    expect(columns.get('updated_at')?.notnull).toBe(1)
    // Échéance facultative : un vaccin peut être consigné sans prochain rappel.
    expect(columns.get('due_date')?.notnull).toBe(0)
    // Suppression logique : la colonne doit rester nullable (NULL = vaccin actif).
    expect(columns.get('deleted_at')?.notnull).toBe(0)

    const foreignKeys = await db.query<{
      table: string
      from: string
      to: string
      on_delete: string
    }>('PRAGMA foreign_key_list(vaccination)')
    // `ON DELETE CASCADE` : une purge éventuelle d'un animal emporte ses vaccins
    // plutôt que de laisser des lignes orphelines.
    expect(foreignKeys).toMatchObject([
      { table: 'animal', from: 'animal_id', to: 'id', on_delete: 'CASCADE' },
    ])

    db.close()
  })

  it('indexe les vaccins par animal', async () => {
    const db = await createSqlJsDbClient()

    await applyMigrations(db)

    const indexes = await db.query<{ name: string }>('PRAGMA index_list(vaccination)')
    expect(indexes.map((index) => index.name)).toContain('idx_vaccination_animal_id')
    const indexedColumns = await db.query<{ name: string }>(
      'PRAGMA index_info(idx_vaccination_animal_id)',
    )
    expect(indexedColumns.map((column) => column.name)).toEqual(['animal_id'])

    db.close()
  })

  it('ajoute la table vaccination à une base déjà en version 1', async () => {
    const db = await createSqlJsDbClient()
    // Appareil déjà installé : seule la v1 a été jouée, la table animal existe
    // avec ses données, et `vaccination` n'existe pas encore.
    const [firstMigration] = migrations
    for (const statement of firstMigration?.statements ?? []) {
      await db.execute(statement)
    }
    await db.execute('PRAGMA user_version = 1')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['a1', 'Miette', 'cat', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
    )

    await applyMigrations(db)

    const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(DATABASE_VERSION)
    expect([...(await tableColumns(db, 'vaccination')).keys()]).toContain('animal_id')
    // La migration ne touche pas aux données déjà présentes.
    const animals = await db.query<{ name: string }>('SELECT name FROM animal')
    expect(animals).toEqual([{ name: 'Miette' }])

    db.close()
  })

  it('refuse un vaccin rattaché à un animal inexistant', async () => {
    const db = await createSqlJsDbClient()
    await applyMigrations(db)
    await db.execute('PRAGMA foreign_keys = ON')

    await expect(
      db.run(
        `INSERT INTO vaccination (id, animal_id, name, last_injection_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'v1',
          'inconnu',
          'CHPPi',
          '2025-06-12',
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        ],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)

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
