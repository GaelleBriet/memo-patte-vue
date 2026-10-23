import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { Animal, AnimalRecord } from '../schema/animal.schema'
import { COLUMNS, NOT_DELETED, type AnimalRow } from './animal-row.repository'

export type AnimalVersion = Pick<Animal, 'id' | 'photoPath' | 'updatedAt' | 'deletedAt'>
export type RestoredAnimal = Omit<AnimalRecord, 'deletedAt'>

const ERASE_ALL = 'DELETE FROM animal'

export function createAnimalImport(db: DbClient, deviceId: () => string) {
  return {
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
  }
}
