import type { SqlStatement } from '@/core/db/db-client'
import { NOT_DELETED } from './vaccination-injection-row.repository'

export function createVaccinationInjectionCascade(deviceId: () => string) {
  return {
    markDeletedByVaccinationStatement(vaccinationId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE vaccination_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), vaccinationId],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
      }
    },

    /** Les lignes supprimées à cet instant, avec leur animal. */
    reviveByAnimalStatement(animalId: string, deletedAt: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), animalId, deletedAt],
      }
    },

    /** Rétablit les injections supprimées avec leur vaccin, à cet instant précis. */
    reviveByVaccinationStatement(
      vaccinationId: string,
      deletedAt: string,
      updatedAt: string,
    ): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE vaccination_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), vaccinationId, deletedAt],
      }
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM vaccination_injection' }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },
  }
}
