// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrationTableNames } from '../clear-all-tables'
import { migrations } from '../migrations'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const MILO = '11111111-1111-4111-8111-111111111111'
const LONG_ANIMAL = '22222222-2222-4222-8222-222222222222'
const LONG_VACCIN = '66666666-6666-4666-8666-666666666666'
const LONG_TRAITEMENT = '77777777-7777-4777-8777-777777777777'
const RAGE = '33333333-3333-4333-8333-333333333333'
const BRAVECTO = '44444444-4444-4444-8444-444444444444'
const PESEE = '55555555-5555-4555-8555-555555555555'
const T1 = '2026-01-10T08:00:00.000Z'
const T2 = '2026-09-25T10:00:00.000Z'

const LIMITE = 'a'.repeat(MAX_NAME_LENGTH)
const TROP_LONG = `${LIMITE}a`
const NOM_81 = 'é'.repeat(MAX_NAME_LENGTH + 1)
const NOM_120 = 'Mademoiselle Cléopâtre de la Grande Prairie des Monts du Lyonnais, '
  .repeat(2)
  .slice(0, 120)
const HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const TROP_LONG_REFUSE = /text longer than 80 characters/

async function seedVersion7(db: InMemoryDb): Promise<void> {
  await db.runMany([
    { sql: 'UPDATE sync_state SET enabled = 1, last_pulled_at = ? WHERE id = 1', params: [T1] },
    {
      sql: `INSERT INTO animal (id, name, species, breed, birth_date, initial_weight_kg, created_at, updated_at)
            VALUES (?, 'Milo', 'dog', 'Labrador', '2023-03-12', 8.5, ?, ?)`,
      params: [MILO, T1, T1],
    },
    {
      sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at) VALUES (?, ?, 'Rage', ?, ?)`,
      params: [RAGE, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO vaccination_injection (id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at)
            VALUES (?, ?, ?, '2025-09-25', '2026-09-25', ?, ?)`,
      params: [RAGE, RAGE, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
            VALUES (?, ?, 'Bravecto', 'antiparasitic', 3, 'month', ?, ?)`,
      params: [BRAVECTO, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO treatment_dose (id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at)
            VALUES (?, ?, ?, '2026-07-08', '2026-10-08', 3, 'month', ?, ?)`,
      params: [BRAVECTO, BRAVECTO, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at) VALUES (?, ?, 8.5, '2026-01-10', ?, ?)`,
      params: [PESEE, MILO, T1, T1],
    },
    {
      sql: `INSERT INTO sync_pull_cursor (entity, last_pulled_at) VALUES ('animal', ?)`,
      params: [T1],
    },
  ])
}

async function seedTooLong(db: InMemoryDb): Promise<void> {
  await db.runMany([
    {
      sql: `INSERT INTO animal (id, name, species, breed, created_at, updated_at) VALUES (?, ?, 'cat', ?, ?, ?)`,
      params: [LONG_ANIMAL, NOM_120, NOM_81, T1, T1],
    },
    {
      sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      params: [LONG_VACCIN, MILO, NOM_81, T1, T1],
    },
    {
      sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
            VALUES (?, ?, ?, 'deworming', 1, 'month', ?, ?)`,
      params: [LONG_TRAITEMENT, MILO, NOM_120, T1, T1],
    },
    { sql: 'DELETE FROM sync_outbox' },
  ])
}

async function snapshot(db: InMemoryDb): Promise<Record<string, unknown[]>> {
  const tables = migrationTableNames()
  const rows = await Promise.all(tables.map((table) => db.query(`SELECT * FROM ${table}`)))
  return Object.fromEntries(tables.map((table, index) => [table, rows[index] ?? []]))
}

async function userVersion(db: InMemoryDb): Promise<number | undefined> {
  const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
  return version?.user_version
}

const insertions = {
  'le nom d’un animal': (name: string) => ({
    sql: `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES ('a-neuf', ?, 'dog', ?, ?)`,
    params: [name, T2, T2],
  }),
  'la race d’un animal': (breed: string) => ({
    sql: `INSERT INTO animal (id, name, species, breed, created_at, updated_at) VALUES ('a-neuf', 'Luna', 'cat', ?, ?, ?)`,
    params: [breed, T2, T2],
  }),
  'le nom d’un vaccin': (name: string) => ({
    sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at) VALUES ('v-neuf', ?, ?, ?, ?)`,
    params: [MILO, name, T2, T2],
  }),
  'le nom d’un traitement': (name: string) => ({
    sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
          VALUES ('t-neuf', ?, ?, 'deworming', 1, 'month', ?, ?)`,
    params: [MILO, name, T2, T2],
  }),
}

const modifications = {
  'le nom d’un animal': (name: string) => ({
    sql: 'UPDATE animal SET name = ?, updated_at = ? WHERE id = ?',
    params: [name, T2, MILO],
  }),
  'la race d’un animal': (breed: string) => ({
    sql: 'UPDATE animal SET breed = ?, updated_at = ? WHERE id = ?',
    params: [breed, T2, MILO],
  }),
  'le nom d’un vaccin': (name: string) => ({
    sql: 'UPDATE vaccination SET name = ?, updated_at = ? WHERE id = ?',
    params: [name, T2, RAGE],
  }),
  'le nom d’un traitement': (name: string) => ({
    sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
          VALUES (?, ?, ?, 'antiparasitic', 3, 'month', ?, ?)
          ON CONFLICT (id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
    params: [BRAVECTO, MILO, name, T1, T2],
  }),
}

describe('migration v8 : noms et race limités à 80 caractères', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute('PRAGMA foreign_keys = ON')
    await applyMigrations(db, 7)
    await seedVersion7(db)
  })

  afterEach(() => {
    db.close()
  })

  it('pose la version 8 dans sa propre transaction, sans attendre le plugin', async () => {
    const v8 = migrations.find(({ toVersion }) => toVersion === 8)

    await db.runMany((v8?.statements ?? []).map((sql) => ({ sql })))

    expect(await userVersion(db)).toBe(8)
  })

  it('garde à l’identique les données d’une base v7 remplie, sans reconstruire de table', async () => {
    const avant = await snapshot(db)
    const schemaAvant = await db.query(`SELECT name, sql FROM sqlite_master WHERE type = 'table'`)

    await applyMigrations(db)

    expect(await snapshot(db)).toEqual(avant)
    await expect(
      db.query(`SELECT name, sql FROM sqlite_master WHERE type = 'table'`),
    ).resolves.toEqual(schemaAvant)
  })

  it.each(Object.entries(insertions))(
    'refuse à l’écriture %s de 81 caractères, accepte 80',
    async (_, insertion) => {
      await applyMigrations(db)

      await expect(db.runMany([insertion(TROP_LONG)])).rejects.toThrow(TROP_LONG_REFUSE)
      await expect(db.runMany([insertion(LIMITE)])).resolves.toBeUndefined()
    },
  )

  it.each(Object.entries(modifications))(
    'refuse à la modification %s de 81 caractères, accepte 80',
    async (_, modification) => {
      await applyMigrations(db)

      await expect(db.runMany([modification(TROP_LONG)])).rejects.toThrow(TROP_LONG_REFUSE)
      await expect(db.runMany([modification(LIMITE)])).resolves.toBeUndefined()
    },
  )

  it('compte les caractères, pas les octets', async () => {
    await applyMigrations(db)

    await expect(
      db.runMany([insertions['le nom d’un animal']('é'.repeat(MAX_NAME_LENGTH))]),
    ).resolves.toBeUndefined()
    await expect(
      db.runMany([modifications['le nom d’un animal']('é'.repeat(MAX_NAME_LENGTH + 1))]),
    ).rejects.toThrow(TROP_LONG_REFUSE)
  })

  it('annule toute la transaction au premier nom trop long : rien n’est écrit', async () => {
    await applyMigrations(db)
    const avant = await snapshot(db)

    await expect(
      db.runMany([
        insertions['le nom d’un vaccin']('Leptospirose'),
        insertions['le nom d’un traitement'](TROP_LONG),
      ]),
    ).rejects.toThrow(TROP_LONG_REFUSE)

    expect(await snapshot(db)).toEqual(avant)
  })
})

describe('migration v8 : noms enregistrés plus longs que la limite', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute('PRAGMA foreign_keys = ON')
    await applyMigrations(db, 7)
    await seedVersion7(db)
    await seedTooLong(db)
  })

  afterEach(() => {
    db.close()
  })

  it('coupe à 80 caractères les noms et la race de 81 et 120 caractères', async () => {
    await applyMigrations(db)

    await expect(
      db.query('SELECT name, breed FROM animal WHERE id = ?', [LONG_ANIMAL]),
    ).resolves.toEqual([
      { name: NOM_120.slice(0, MAX_NAME_LENGTH), breed: NOM_81.slice(0, MAX_NAME_LENGTH) },
    ])
    await expect(
      db.query('SELECT name FROM vaccination WHERE id = ?', [LONG_VACCIN]),
    ).resolves.toEqual([{ name: NOM_81.slice(0, MAX_NAME_LENGTH) }])
    await expect(
      db.query('SELECT name FROM treatment WHERE id = ?', [LONG_TRAITEMENT]),
    ).resolves.toEqual([{ name: NOM_120.slice(0, MAX_NAME_LENGTH) }])
  })

  it('date la coupe et met en file ces lignes seules, pour que la synchro les renvoie', async () => {
    await applyMigrations(db)

    const coupees = await db.query<{ entity: string; id: string; updated_at: string }>(
      `SELECT 'animal' AS entity, id, updated_at FROM animal WHERE id = ?
       UNION ALL SELECT 'treatment', id, updated_at FROM treatment WHERE id = ?
       UNION ALL SELECT 'vaccination', id, updated_at FROM vaccination WHERE id = ?`,
      [LONG_ANIMAL, LONG_TRAITEMENT, LONG_VACCIN],
    )
    for (const { updated_at } of coupees) {
      expect(updated_at).toMatch(HORODATAGE)
      expect(updated_at > T1).toBe(true)
    }
    await expect(
      db.query('SELECT entity, entity_id, queued_at FROM sync_outbox ORDER BY entity'),
    ).resolves.toEqual(
      coupees.map(({ entity, id, updated_at }) => ({
        entity,
        entity_id: id,
        queued_at: updated_at,
      })),
    )
  })

  it('laisse intact tout le reste du carnet', async () => {
    const coupees = new Set([LONG_ANIMAL, LONG_VACCIN, LONG_TRAITEMENT])
    const reste = (data: Record<string, unknown[]>) =>
      Object.fromEntries(
        Object.entries(data)
          .filter(([table]) => table !== 'sync_outbox')
          .map(([table, rows]) => [
            table,
            rows.filter((row) => !coupees.has((row as { id?: string }).id ?? '')),
          ]),
      )
    const avant = reste(await snapshot(db))

    await applyMigrations(db)

    expect(reste(await snapshot(db))).toEqual(avant)
  })
})
