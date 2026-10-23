import type { SqlStatement } from '@/core/db/db-client'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import { COLUMNS, NOT_DELETED, headInjectionIdSql } from './vaccination-injection-row.repository'

export function createVaccinationInjectionStatements(deviceId: () => string) {
  return {
    insertStatement(injection: VaccinationInjection): SqlStatement {
      return {
        sql: `INSERT INTO vaccination_injection (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          injection.id,
          injection.vaccinationId,
          injection.animalId,
          injection.injectedOn,
          injection.nextDueDate,
          injection.createdAt,
          injection.updatedAt,
          injection.deletedAt,
          deviceId(),
          deviceId(),
        ],
      }
    },

    reviveStatement(id: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
            WHERE id = ?`,
        params: [updatedAt, deviceId(), id],
      }
    },

    updateHeadDueStatement(
      vaccinationId: string,
      { nextDueDate, updatedAt }: Pick<VaccinationInjection, 'nextDueDate' | 'updatedAt'>,
    ): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection
              SET next_due_date = ?, updated_at = ?, updated_by_device = ?
              WHERE id = ${headInjectionIdSql('?')}`,
        params: [nextDueDate, updatedAt, deviceId(), vaccinationId],
      }
    },

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
