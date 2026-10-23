import type { SqlStatement } from '@/core/db/db-client'
import { COLUMNS, type RestoredVaccinationInjection } from './vaccination-injection-row.repository'

export function createVaccinationInjectionImport() {
  return {
    /** Une injection existante garde son vaccin et son animal : sa date et son rappel suivent le fichier. */
    restoreStatement(injection: RestoredVaccinationInjection, exists: boolean): SqlStatement {
      return exists
        ? {
            sql: `UPDATE vaccination_injection
                  SET injected_on = ?, next_due_date = ?, created_at = ?, updated_at = ?,
                      deleted_at = NULL, created_by_device = ?, updated_by_device = ?
                  WHERE id = ?`,
            params: [
              injection.injectedOn,
              injection.nextDueDate,
              injection.createdAt,
              injection.updatedAt,
              injection.createdByDevice,
              injection.updatedByDevice,
              injection.id,
            ],
          }
        : {
            sql: `INSERT INTO vaccination_injection (${COLUMNS})
                  VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            params: [
              injection.id,
              injection.vaccinationId,
              injection.animalId,
              injection.injectedOn,
              injection.nextDueDate,
              injection.createdAt,
              injection.updatedAt,
              injection.createdByDevice,
              injection.updatedByDevice,
            ],
          }
    },
  }
}
