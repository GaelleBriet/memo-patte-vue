import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createPushedRowReplacement } from '@/core/sync/repository/pushed-row-replacement'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import { type Animal, type AnimalRecord } from '../schema/animal.schema'
import { createAnimalDeparture } from './animal-departure.repository'
import { createAnimalReads } from './animal-reads.repository'
import { COLUMNS, NOT_DELETED, type AnimalRow } from './animal-row.repository'
import { createAnimalWrites } from './animal-writes.repository'

export type AnimalVersion = Pick<Animal, 'id' | 'photoPath' | 'updatedAt' | 'deletedAt'>
export type RestoredAnimal = Omit<AnimalRecord, 'deletedAt'>

const ERASE_ALL = 'DELETE FROM animal'

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
  const reads = createAnimalReads(db)

  return {
    entity: 'animal',

    ...reads,
    ...createAnimalWrites(db, deviceId, reads),
    ...createAnimalDeparture(db, deviceId),

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
    ...createPushedRowReplacement({ table: 'animal', columns: COLUMNS }),

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
