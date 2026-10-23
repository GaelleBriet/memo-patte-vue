import type { SqlStatement } from '@/core/db/db-client'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import { COLUMNS, headInjectionIdSql } from './vaccination-injection-row.repository'

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
  }
}

export type VaccinationInjectionStatements = ReturnType<typeof createVaccinationInjectionStatements>
