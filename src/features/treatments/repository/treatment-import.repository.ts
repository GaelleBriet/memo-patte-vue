import type { DbClient, SqlStatement } from '@/core/db/db-client'
import {
  COLUMNS,
  NOT_DELETED,
  type StampedTreatmentRecord,
  type TreatmentRow,
} from './treatment-row.repository'
import type { Treatment } from '../schema/treatment.schema'

export type TreatmentVersion = Pick<Treatment, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
export type RestoredTreatment = StampedTreatmentRecord

export function createTreatmentImport(db: DbClient, deviceId: () => string) {
  return {
    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<TreatmentVersion[]> {
      const rows = await db.query<TreatmentRow>(`SELECT ${COLUMNS} FROM treatment`)
      return rows.map(({ id, animal_id, updated_at, deleted_at }) => ({
        id,
        animalId: animal_id,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM treatment' }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    /** Rend la ligne visible sans la changer d'animal. */
    restoreStatement(treatment: RestoredTreatment, exists: boolean): SqlStatement {
      const values = [
        treatment.name,
        treatment.type,
        treatment.createdAt,
        treatment.updatedAt,
        treatment.createdByDevice,
        treatment.updatedByDevice,
      ]
      return exists
        ? {
            sql: `UPDATE treatment
                  SET name = ?, type = ?, created_at = ?, updated_at = ?, created_by_device = ?,
                      updated_by_device = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [...values, treatment.id],
          }
        : {
            sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at,
                    created_by_device, updated_by_device)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [treatment.id, treatment.animalId, ...values],
          }
    },
  }
}
