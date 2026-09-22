import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import { animalInputSchema, type Animal, type AnimalInput } from '../schema/animal.schema'

interface AnimalRow {
  id: string
  name: string
  species: string
  breed: string | null
  birth_date: string | null
  initial_weight_kg: number | null
  photo_path: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AnimalVersion = Pick<Animal, 'id' | 'photoPath' | 'updatedAt' | 'deletedAt'>
export type RestoredAnimal = Omit<Animal, 'deletedAt'>

const COLUMNS =
  'id, name, species, breed, birth_date, initial_weight_kg, photo_path, created_at, updated_at, deleted_at'

/** Les animaux supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

function toAnimal(row: AnimalRow): Animal {
  return {
    id: row.id,
    name: row.name,
    species: row.species as Animal['species'],
    breed: row.breed,
    birthDate: row.birth_date,
    initialWeightKg: row.initial_weight_kg,
    photoPath: row.photo_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export interface AnimalsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

export function createAnimalsRepository(
  db: DbClient,
  { loadSupabaseClient: loadClient = loadSupabaseClient }: AnimalsRepositoryDependencies = {},
) {
  async function getById(id: string): Promise<Animal | null> {
    const rows = await db.query<AnimalRow>(
      `SELECT ${COLUMNS} FROM animal WHERE id = ? AND ${NOT_DELETED}`,
      [id],
    )
    const row = rows[0]
    return row ? toAnimal(row) : null
  }

  return {
    entity: 'animal',

    getById,

    async list(): Promise<Animal[]> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal WHERE ${NOT_DELETED}
         ORDER BY created_at, name COLLATE NOCASE`,
      )
      return rows.map(toAnimal)
    },

    async create(input: AnimalInput): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const now = new Date().toISOString()
      const animal: Animal = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.run(`INSERT INTO animal (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        animal.id,
        animal.name,
        animal.species,
        animal.breed,
        animal.birthDate,
        animal.initialWeightKg,
        animal.photoPath,
        animal.createdAt,
        animal.updatedAt,
        animal.deletedAt,
      ])

      return animal
    },

    async update(id: string, input: AnimalInput): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE animal
         SET name = ?, species = ?, breed = ?, birth_date = ?, initial_weight_kg = ?,
             photo_path = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [
          data.name,
          data.species,
          data.breed,
          data.birthDate,
          data.initialWeightKg,
          data.photoPath,
          updatedAt,
          id,
        ],
      )

      if (changes === 0) {
        throw new Error(`Animal introuvable : ${id}`)
      }

      const animal = await getById(id)
      if (!animal) {
        throw new Error(`Animal introuvable : ${id}`)
      }
      return animal
    },

    /** Sans effet sur un animal inconnu ou déjà supprimé : la date initiale est gardée. */
    async remove(
      id: string,
      cascade: SqlStatement[] = [],
      deletedAt: string = new Date().toISOString(),
    ): Promise<void> {
      await db.runMany([
        {
          sql: `UPDATE animal SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, id],
        },
        ...cascade,
      ])
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<AnimalVersion[]> {
      const rows = await db.query<AnimalRow>(`SELECT ${COLUMNS} FROM animal`)
      return rows.map(({ id, photo_path, updated_at, deleted_at }) => ({
        id,
        photoPath: photo_path,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE animal SET deleted_at = ?, updated_at = ? WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt],
      }
    },

    /** Reprend l'identifiant et les dates du fichier importé, et rend la ligne visible. */
    restoreStatement(animal: RestoredAnimal, exists: boolean): SqlStatement {
      const values = [
        animal.name,
        animal.species,
        animal.breed,
        animal.birthDate,
        animal.initialWeightKg,
        animal.photoPath,
        animal.createdAt,
        animal.updatedAt,
      ]
      return exists
        ? {
            sql: `UPDATE animal
                  SET name = ?, species = ?, breed = ?, birth_date = ?, initial_weight_kg = ?,
                      photo_path = ?, created_at = ?, updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [...values, animal.id],
          }
        : {
            sql: `INSERT INTO animal (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            params: [animal.id, ...values],
          }
    },

    /** Joue en une transaction les instructions d'import de l'animal et de son carnet. */
    async runImport(statements: SqlStatement[]): Promise<void> {
      await db.runMany(statements)
    },

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<AnimalRow>(`SELECT ${COLUMNS} FROM animal WHERE id = ?`, [id])
      return (rows[0] as SyncRow | undefined) ?? null
    },

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'animal', ['user_id', 'id'], { ...row, user_id: userId })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('animal')
        .select(`${COLUMNS}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as Array<AnimalRow & { server_updated_at: string }>
      const cursor = rows.length > 0 ? (rows.at(-1)?.server_updated_at ?? null) : null
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...columns }) => columns as SyncRow),
        cursor,
      }
    },

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO animal (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                name = excluded.name, species = excluded.species, breed = excluded.breed,
                birth_date = excluded.birth_date, initial_weight_kg = excluded.initial_weight_kg,
                photo_path = excluded.photo_path, created_at = excluded.created_at,
                updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > animal.updated_at`,
        params: [
          row.id,
          syncField(row, 'name'),
          syncField(row, 'species'),
          syncField(row, 'breed'),
          syncField(row, 'birth_date'),
          syncField(row, 'initial_weight_kg'),
          syncField(row, 'photo_path'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
        ],
      }
    },
  }
}

export type AnimalsRepository = ReturnType<typeof createAnimalsRepository>

let repository: Promise<AnimalsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getAnimalsRepository(): Promise<AnimalsRepository> {
  repository ??= getDb()
    .then(createAnimalsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
