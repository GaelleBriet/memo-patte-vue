import type { SqlStatement } from '@/core/db/db-client'
import { NOT_DELETED } from './treatment-period-row.repository'

export function createPeriodDeletion(deviceId: () => string) {
  return {
    markDeletedByTreatmentStatement(treatmentId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE treatment_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), treatmentId],
      }
    },

    /** Les périodes supprimées à cet instant, avec leur traitement. */
    reviveByTreatmentStatement(
      treatmentId: string,
      deletedAt: string,
      updatedAt: string,
    ): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE treatment_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), treatmentId, deletedAt],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
      }
    },

    /** Les lignes supprimées à cet instant, avec leur animal. */
    reviveByAnimalStatement(animalId: string, deletedAt: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), animalId, deletedAt],
      }
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM treatment_period' }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },
  }
}
