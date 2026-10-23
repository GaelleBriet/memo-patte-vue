import type { DbClient, SqlStatement } from '@/core/db/db-client'
import {
  COLUMNS,
  NOT_DELETED,
  type RestoredVaccination,
  type VaccinationRow,
  type VaccinationVersion,
} from './vaccination-row.repository'

export function createVaccinationImport(db: DbClient, deviceId: () => string) {
  return {
    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<VaccinationVersion[]> {
      const rows = await db.query<VaccinationRow>(`SELECT ${COLUMNS} FROM vaccination`)
      return rows.map(({ id, animal_id, updated_at, deleted_at }) => ({
        id,
        animalId: animal_id,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM vaccination' }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    /** Reprend les dates du fichier importé et rend la ligne visible, sans la changer d'animal. */
    restoreStatement(vaccination: RestoredVaccination, exists: boolean): SqlStatement {
      const { id, animalId, name, plannedDueDate, createdAt, updatedAt } = vaccination
      const devices = [vaccination.createdByDevice, vaccination.updatedByDevice]
      return exists
        ? {
            sql: `UPDATE vaccination
                  SET name = ?, planned_due_date = ?, created_at = ?, updated_at = ?,
                      deleted_at = NULL, created_by_device = ?, updated_by_device = ?
                  WHERE id = ?`,
            params: [name, plannedDueDate, createdAt, updatedAt, ...devices, id],
          }
        : {
            sql: `INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            params: [id, animalId, name, plannedDueDate, createdAt, updatedAt, ...devices],
          }
    },
  }
}
