// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrationTableNames } from '../clear-all-tables'
import { DATABASE_VERSION, migrations } from '../migrations'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const NOW = '2026-10-01T08:00:00.000Z'
const MILO = '11111111-1111-4111-8111-111111111111'
const RAGE = '33333333-3333-4333-8333-333333333333'
const BRAVECTO = '44444444-4444-4444-8444-444444444444'
const CARNET_SETTINGS_ID = '00000000-0000-0000-0000-000000000000'

const LIMITE = 'a'.repeat(MAX_NAME_LENGTH)
const TROP_LONG = `${LIMITE}a`
const TROP_LONG_REFUSE = /text longer than 80 characters/

interface TableInfoRow {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

async function columns(db: InMemoryDb, table: string): Promise<Map<string, TableInfoRow>> {
  const rows = await db.query<TableInfoRow>(`PRAGMA table_info(${table})`)
  return new Map(rows.map((row) => [row.name, row]))
}

async function columnNames(db: InMemoryDb, table: string): Promise<string[]> {
  return [...(await columns(db, table)).keys()]
}

async function foreignKeys(db: InMemoryDb, table: string) {
  return db.query<{ table: string; from: string; to: string; on_delete: string }>(
    `PRAGMA foreign_key_list(${table})`,
  )
}

async function schemaObjects(db: InMemoryDb, type: 'index' | 'trigger'): Promise<string[]> {
  const rows = await db.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    [type],
  )
  return rows.map(({ name }) => name)
}

function insertAnimal(db: InMemoryDb, values: Record<string, string | number | null> = {}) {
  const row = {
    id: MILO,
    name: 'Milo',
    species: 'dog',
    created_at: NOW,
    updated_at: NOW,
    ...values,
  }
  const names = Object.keys(row)
  return db.run(
    `INSERT INTO animal (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    Object.values(row),
  )
}

describe('migrations', () => {
  it('ne contient que la v9, qui crée le schéma entier', () => {
    expect(migrations.map(({ toVersion }) => toVersion)).toEqual([9])
    expect(DATABASE_VERSION).toBe(9)
  })
})

describe('schéma v9 sur une installation neuve', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute('PRAGMA foreign_keys = ON')
    await applyMigrations(db)
  })

  afterEach(() => {
    db.close()
  })

  it('crée toutes les tables du modèle, et elles seules', async () => {
    const rows = await db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )

    expect(rows.map(({ name }) => name)).toEqual([
      'animal',
      'carnet_settings',
      'sync_outbox',
      'sync_pull_cursor',
      'sync_state',
      'treatment',
      'treatment_dose',
      'vaccination',
      'vaccination_injection',
      'weight_entry',
    ])
    expect([...migrationTableNames()].sort()).toEqual(rows.map(({ name }) => name))
  })

  it('pose la version 9 dans sa propre transaction, sans attendre le plugin', async () => {
    const fresh = await createSqlJsDbClient()

    await fresh.runMany((migrations[0]?.statements ?? []).map((sql) => ({ sql })))

    const [version] = await fresh.query<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(9)
    fresh.close()
  })

  it('ne rejoue rien au second passage', async () => {
    await insertAnimal(db)

    await applyMigrations(db)

    await expect(db.query('SELECT id FROM animal')).resolves.toEqual([{ id: MILO }])
  })

  describe('animal', () => {
    it('porte les colonnes du modèle, sans poids initial', async () => {
      expect(await columnNames(db, 'animal')).toEqual([
        'id',
        'name',
        'species',
        'breed',
        'birth_date',
        'birth_date_approximate',
        'photo_path',
        'unfollowed_on',
        'departure_reason',
        'departure_date',
        'created_at',
        'updated_at',
        'deleted_at',
      ])
    })

    it('crée un animal suivi, sans départ ni date approximative', async () => {
      await insertAnimal(db)

      await expect(
        db.query(
          `SELECT birth_date_approximate, unfollowed_on, departure_reason, departure_date
           FROM animal`,
        ),
      ).resolves.toEqual([
        {
          birth_date_approximate: 0,
          unfollowed_on: null,
          departure_reason: null,
          departure_date: null,
        },
      ])
    })

    it.each(['death', 'rehomed', 'other'])('accepte le motif de départ %s', async (reason) => {
      await expect(insertAnimal(db, { departure_reason: reason })).resolves.toBe(1)
    })

    it.each([
      ['une espèce hors chien et chat', { species: 'fish' }],
      ['un motif de départ inconnu', { departure_reason: 'lost' }],
      ['une date approximative autre que 0 ou 1', { birth_date_approximate: 2 }],
      ['une date approximative vide', { birth_date_approximate: null }],
    ])('refuse %s', async (_, values) => {
      await expect(insertAnimal(db, values)).rejects.toThrow(/constraint failed/)
    })
  })

  it('garde la table des pesées telle quelle, rattachée à l’animal', async () => {
    expect(await columnNames(db, 'weight_entry')).toEqual([
      'id',
      'animal_id',
      'weight_kg',
      'measured_on',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
    expect(await foreignKeys(db, 'weight_entry')).toMatchObject([
      { table: 'animal', from: 'animal_id', to: 'id', on_delete: 'CASCADE' },
    ])
  })

  describe('vaccination', () => {
    it('porte un rappel prévu facultatif, rattaché à l’animal', async () => {
      expect(await columnNames(db, 'vaccination')).toEqual([
        'id',
        'animal_id',
        'name',
        'planned_due_date',
        'created_at',
        'updated_at',
        'deleted_at',
      ])
      expect((await columns(db, 'vaccination')).get('planned_due_date')?.notnull).toBe(0)
      expect(await foreignKeys(db, 'vaccination')).toMatchObject([
        { table: 'animal', from: 'animal_id', to: 'id', on_delete: 'CASCADE' },
      ])
    })

    it('existe sans injection', async () => {
      await insertAnimal(db)

      await expect(
        db.run(
          `INSERT INTO vaccination (id, animal_id, name, planned_due_date, created_at, updated_at)
           VALUES (?, ?, 'Rage', '2026-10-05', ?, ?)`,
          [RAGE, MILO, NOW, NOW],
        ),
      ).resolves.toBe(1)
    })

    it('refuse un vaccin rattaché à un animal inexistant', async () => {
      await expect(
        db.run(
          `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at)
           VALUES (?, 'inconnu', 'Rage', ?, ?)`,
          [RAGE, NOW, NOW],
        ),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/)
    })

    it('garde les injections telles quelles', async () => {
      expect(await columnNames(db, 'vaccination_injection')).toEqual([
        'id',
        'vaccination_id',
        'animal_id',
        'injected_on',
        'next_due_date',
        'created_at',
        'updated_at',
        'deleted_at',
      ])
    })
  })

  it('garde les traitements et leurs prises dans leur forme v8', async () => {
    expect(await columnNames(db, 'treatment')).toEqual([
      'id',
      'animal_id',
      'name',
      'type',
      'frequency_value',
      'frequency_unit',
      'stopped_on',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
    expect(await columnNames(db, 'treatment_dose')).toEqual([
      'id',
      'treatment_id',
      'animal_id',
      'given_on',
      'next_due_date',
      'frequency_value',
      'frequency_unit',
      'created_at',
      'updated_at',
      'deleted_at',
    ])
  })

  describe('carnet_settings', () => {
    function insertSettings(values: Record<string, string | number | null> = {}) {
      const row = { id: CARNET_SETTINGS_ID, created_at: NOW, updated_at: NOW, ...values }
      const names = Object.keys(row)
      return db.run(
        `INSERT INTO carnet_settings (${names.join(', ')})
         VALUES (${names.map(() => '?').join(', ')})`,
        Object.values(row),
      )
    }

    it('crée la ligne avec l’heure des rappels de vaccins à 9 h et la prévenance active', async () => {
      await insertSettings()

      await expect(
        db.query(
          'SELECT vaccine_reminder_time, remind_before_due, deleted_at FROM carnet_settings',
        ),
      ).resolves.toEqual([
        { vaccine_reminder_time: '09:00', remind_before_due: 1, deleted_at: null },
      ])
    })

    it.each([
      ['un autre identifiant que l’identifiant fixe', { id: MILO }],
      ['une heure mal formée', { vaccine_reminder_time: '9h' }],
      ['une heure hors du cadran', { vaccine_reminder_time: '24:00' }],
      ['une prévenance autre que 0 ou 1', { remind_before_due: 2 }],
    ])('refuse %s', async (_, values) => {
      await expect(insertSettings(values)).rejects.toThrow(/constraint failed/)
    })

    it('n’a qu’une ligne', async () => {
      await insertSettings()

      await expect(insertSettings({ vaccine_reminder_time: '08:30' })).rejects.toThrow(
        /UNIQUE constraint failed/,
      )
    })
  })

  it('crée l’état de synchronisation désactivé, sans date de dernière synchronisation', async () => {
    expect(await columnNames(db, 'sync_state')).toEqual([
      'id',
      'enabled',
      'restoring',
      'last_synced_at',
    ])
    await expect(db.query('SELECT * FROM sync_state')).resolves.toEqual([
      { id: 1, enabled: 0, restoring: 0, last_synced_at: null },
    ])
  })

  it('indexe chaque clé étrangère', async () => {
    expect(await schemaObjects(db, 'index')).toEqual([
      'idx_treatment_animal_id',
      'idx_treatment_dose_animal_id',
      'idx_treatment_dose_treatment',
      'idx_vaccination_animal_id',
      'idx_vaccination_injection_animal_id',
      'idx_vaccination_injection_vaccination',
      'idx_weight_entry_animal_id',
    ])
  })

  it('met en file d’envoi chaque table synchronisée, réglages du carnet compris', async () => {
    const outboxTriggers = (await schemaObjects(db, 'trigger')).filter((name) =>
      name.includes('_outbox_'),
    )

    expect(outboxTriggers).toEqual(
      [
        'animal',
        'carnet_settings',
        'treatment',
        'treatment_dose',
        'vaccination',
        'vaccination_injection',
        'weight_entry',
      ]
        .flatMap((table) => [`${table}_outbox_insert`, `${table}_outbox_update`])
        .sort(),
    )
  })

  describe('noms et race limités à 80 caractères', () => {
    beforeEach(async () => {
      await insertAnimal(db)
      await db.runMany([
        {
          sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at)
                VALUES (?, ?, 'Rage', ?, ?)`,
          params: [RAGE, MILO, NOW, NOW],
        },
        {
          sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
                VALUES (?, ?, 'Bravecto', 'antiparasitic', 3, 'month', ?, ?)`,
          params: [BRAVECTO, MILO, NOW, NOW],
        },
      ])
    })

    const insertions = {
      'le nom d’un animal': (name: string) => ({
        sql: `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES ('a-neuf', ?, 'dog', ?, ?)`,
        params: [name, NOW, NOW],
      }),
      'la race d’un animal': (breed: string) => ({
        sql: `INSERT INTO animal (id, name, species, breed, created_at, updated_at) VALUES ('a-neuf', 'Luna', 'cat', ?, ?, ?)`,
        params: [breed, NOW, NOW],
      }),
      'le nom d’un vaccin': (name: string) => ({
        sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at) VALUES ('v-neuf', ?, ?, ?, ?)`,
        params: [MILO, name, NOW, NOW],
      }),
      'le nom d’un traitement': (name: string) => ({
        sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
              VALUES ('t-neuf', ?, ?, 'deworming', 1, 'month', ?, ?)`,
        params: [MILO, name, NOW, NOW],
      }),
    }

    const modifications = {
      'le nom d’un animal': (name: string) => ({
        sql: 'UPDATE animal SET name = ? WHERE id = ?',
        params: [name, MILO],
      }),
      'la race d’un animal': (breed: string) => ({
        sql: 'UPDATE animal SET breed = ? WHERE id = ?',
        params: [breed, MILO],
      }),
      'le nom d’un vaccin': (name: string) => ({
        sql: 'UPDATE vaccination SET name = ? WHERE id = ?',
        params: [name, RAGE],
      }),
      'le nom d’un traitement': (name: string) => ({
        sql: 'UPDATE treatment SET name = ? WHERE id = ?',
        params: [name, BRAVECTO],
      }),
    }

    it.each(Object.entries(insertions))(
      'refuse à l’écriture %s de 81 caractères, accepte 80',
      async (_, insertion) => {
        await expect(db.runMany([insertion(TROP_LONG)])).rejects.toThrow(TROP_LONG_REFUSE)
        await expect(db.runMany([insertion(LIMITE)])).resolves.toBeUndefined()
      },
    )

    it.each(Object.entries(modifications))(
      'refuse à la modification %s de 81 caractères, accepte 80',
      async (_, modification) => {
        await expect(db.runMany([modification(TROP_LONG)])).rejects.toThrow(TROP_LONG_REFUSE)
        await expect(db.runMany([modification(LIMITE)])).resolves.toBeUndefined()
      },
    )

    it('compte les caractères, pas les octets', async () => {
      await expect(
        db.runMany([insertions['le nom d’un animal']('é'.repeat(MAX_NAME_LENGTH))]),
      ).resolves.toBeUndefined()
      await expect(
        db.runMany([modifications['le nom d’un animal']('é'.repeat(MAX_NAME_LENGTH + 1))]),
      ).rejects.toThrow(TROP_LONG_REFUSE)
    })
  })
})
