import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import {
  animalInputSchema,
  type Animal,
  type AnimalInput,
  type AnimalRecord,
  type Departure,
} from '../schema/animal.schema'

interface AnimalRow {
  id: string
  name: string
  species: string
  breed: string | null
  birth_date: string | null
  birth_date_approximate: number
  photo_path: string | null
  unfollowed_on: string | null
  departure_reason: string | null
  departure_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

export type AnimalVersion = Pick<Animal, 'id' | 'photoPath' | 'updatedAt' | 'deletedAt'>
export type RestoredAnimal = Omit<AnimalRecord, 'deletedAt'>

const COLUMNS =
  'id, name, species, breed, birth_date, birth_date_approximate, photo_path, unfollowed_on, ' +
  'departure_reason, departure_date, created_at, updated_at, deleted_at, created_by_device, ' +
  'updated_by_device'

const INSERT = `INSERT INTO animal
  (id, name, species, breed, birth_date, birth_date_approximate, photo_path, created_at, updated_at,
   created_by_device, updated_by_device)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

/** Les animaux supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

const ERASE_ALL = 'DELETE FROM animal'

function toAnimal(row: AnimalRow): Animal {
  return {
    id: row.id,
    name: row.name,
    species: row.species as Animal['species'],
    breed: row.breed,
    birthDate: row.birth_date,
    birthDateApproximate: row.birth_date_approximate === 1,
    photoPath: row.photo_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    unfollowedOn: row.unfollowed_on,
    departureReason: row.departure_reason as Animal['departureReason'],
    departureDate: row.departure_date,
  }
}

function toAnimalRecord(row: AnimalRow): AnimalRecord {
  return {
    ...toAnimal(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}

export interface AnimalsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

export function createAnimalsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: AnimalsRepositoryDependencies = {},
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

    /** Animaux visibles, toutes colonnes comprises, dans l'ordre de `list`. */
    async listRecords(): Promise<AnimalRecord[]> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal WHERE ${NOT_DELETED}
         ORDER BY created_at, name COLLATE NOCASE`,
      )
      return rows.map(toAnimalRecord)
    },

    /** `related` : écritures d'autres tables liées à la création, jouées dans la même transaction. */
    async create(
      input: AnimalInput,
      related: (animal: Animal) => SqlStatement[] = () => [],
    ): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const now = new Date().toISOString()
      const animal: Animal = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        unfollowedOn: null,
        departureReason: null,
        departureDate: null,
      }

      await db.runMany([
        {
          sql: INSERT,
          params: [
            animal.id,
            animal.name,
            animal.species,
            animal.breed,
            animal.birthDate,
            animal.birthDateApproximate ? 1 : 0,
            animal.photoPath,
            animal.createdAt,
            animal.updatedAt,
            deviceId(),
            deviceId(),
          ],
        },
        ...related(animal),
      ])

      return animal
    },

    async update(id: string, input: AnimalInput): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE animal
         SET name = ?, species = ?, breed = ?, birth_date = ?, birth_date_approximate = ?,
             photo_path = ?, updated_at = ?, updated_by_device = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [
          data.name,
          data.species,
          data.breed,
          data.birthDate,
          data.birthDateApproximate ? 1 : 0,
          data.photoPath,
          updatedAt,
          deviceId(),
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
          sql: `UPDATE animal SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        ...cascade,
      ])
    },

    /**
     * Rend l'animal supprimé à cet instant, et lui seul, avec les écritures de `revive`. Lève sans
     * rien écrire quand il n'a pas été supprimé à cet instant ou qu'il a déjà été rendu.
     */
    async restore(id: string, deletedAt: string, revive: SqlStatement[] = []): Promise<void> {
      const deleted = await db.query<{ id: string }>(
        'SELECT id FROM animal WHERE id = ? AND deleted_at = ?',
        [id, deletedAt],
      )
      if (deleted.length === 0) throw new Error(`Animal introuvable à rendre : ${id}`)
      const at = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE animal SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND deleted_at = ?`,
          params: [at, deviceId(), id, deletedAt],
        },
        ...revive,
      ])
    },

    /** `null` pour un animal inconnu ou supprimé. */
    async getDeparture(id: string): Promise<Departure | null> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal WHERE id = ? AND ${NOT_DELETED}`,
        [id],
      )
      const row = rows[0]
      if (!row) return null
      const { unfollowedOn, departureReason, departureDate } = toAnimalRecord(row)
      return { unfollowedOn, departureReason, departureDate }
    },

    /** `related` : écritures d'autres tables jouées dans la même transaction. */
    async setDeparture(
      id: string,
      departure: Departure,
      related: SqlStatement[] = [],
    ): Promise<void> {
      const at = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE animal
                SET unfollowed_on = ?, departure_reason = ?, departure_date = ?, updated_at = ?,
                    updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [
            departure.unfollowedOn,
            departure.departureReason,
            departure.departureDate,
            at,
            deviceId(),
            id,
          ],
        },
        ...related,
      ])
    },

    /** Lève pour un animal suivi ou supprimé : rien n'est écrit. */
    async setDepartureDetails(
      id: string,
      { departureReason, departureDate }: Omit<Departure, 'unfollowedOn'>,
    ): Promise<void> {
      const changed = await db.run(
        `UPDATE animal
         SET departure_reason = ?, departure_date = ?, updated_at = ?, updated_by_device = ?
         WHERE id = ? AND unfollowed_on IS NOT NULL AND ${NOT_DELETED}`,
        [departureReason, departureDate, new Date().toISOString(), deviceId(), id],
      )
      if (changed === 0) throw new Error(`Animal suivi ou introuvable : ${id}`)
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
        sql: `UPDATE animal SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    /** Effacement physique, sans trace pour la synchro : rien ne part vers la sauvegarde cloud. */
    eraseAllStatement(): SqlStatement {
      return { sql: ERASE_ALL }
    },

    /** Efface les animaux après `cascade`, en une transaction. */
    async eraseAll(cascade: SqlStatement[]): Promise<void> {
      await db.runMany([...cascade, { sql: ERASE_ALL }])
    },

    /** Reprend l'identifiant et les dates du fichier importé, et rend la ligne visible. */
    restoreStatement(animal: RestoredAnimal, exists: boolean): SqlStatement {
      const values = [
        animal.name,
        animal.species,
        animal.breed,
        animal.birthDate,
        animal.birthDateApproximate ? 1 : 0,
        animal.photoPath,
        animal.unfollowedOn,
        animal.departureReason,
        animal.departureDate,
        animal.createdAt,
        animal.updatedAt,
      ]
      const devices = [animal.createdByDevice, animal.updatedByDevice]
      return exists
        ? {
            sql: `UPDATE animal
                  SET name = ?, species = ?, breed = ?, birth_date = ?, birth_date_approximate = ?,
                      photo_path = ?, unfollowed_on = ?, departure_reason = ?, departure_date = ?,
                      created_at = ?, updated_at = ?, deleted_at = NULL, created_by_device = ?,
                      updated_by_device = ?
                  WHERE id = ?`,
            params: [...values, ...devices, animal.id],
          }
        : {
            sql: `INSERT INTO animal (${COLUMNS})
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            params: [animal.id, ...values, ...devices],
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

    ...createRemoteSyncTable({ table: 'animal', columns: COLUMNS, loadClient }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO animal (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                name = excluded.name, species = excluded.species, breed = excluded.breed,
                birth_date = excluded.birth_date,
                birth_date_approximate = excluded.birth_date_approximate,
                photo_path = excluded.photo_path, unfollowed_on = excluded.unfollowed_on,
                departure_reason = excluded.departure_reason,
                departure_date = excluded.departure_date, created_at = excluded.created_at,
                updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
                created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
              WHERE excluded.updated_at > animal.updated_at`,
        params: [
          row.id,
          syncField(row, 'name'),
          syncField(row, 'species'),
          syncField(row, 'breed'),
          syncField(row, 'birth_date'),
          syncField(row, 'birth_date_approximate'),
          syncField(row, 'photo_path'),
          syncField(row, 'unfollowed_on'),
          syncField(row, 'departure_reason'),
          syncField(row, 'departure_date'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
          syncField(row, 'created_by_device'),
          syncField(row, 'updated_by_device'),
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
