import type { SqlStatement } from '@/core/db/db-client'
import type { DoseFields, DoseOwner, TreatmentDose } from '../schema/treatment-dose.schema'
import {
  COLUMNS,
  NOT_DELETED,
  PLACEHOLDERS,
  placeholders,
  valuesOf,
} from './treatment-dose-row.repository'

export function createDoseLineStatements(deviceId: () => string) {
  function insertStatement(dose: TreatmentDose): SqlStatement {
    const device = deviceId()
    return {
      sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (${PLACEHOLDERS})`,
      params: valuesOf({ ...dose, createdByDevice: device, updatedByDevice: device }),
    }
  }

  /** Prise calculée par le moteur d'échéances : aucune garde par jour, l'unicité est celle de l'échéance. */
  function createStatement({
    dose,
    at,
    ...owner
  }: DoseOwner & { dose: DoseFields; at: string }): SqlStatement {
    return insertStatement({ ...owner, ...dose, createdAt: at, updatedAt: at, deletedAt: null })
  }

  /** Sans effet sur une ligne supprimée. */
  function rewriteStatement(id: string, dose: DoseFields, updatedAt: string): SqlStatement {
    return {
      sql: `UPDATE treatment_dose
            SET period_id = ?, due_on = ?, due_time = ?, given_on = ?, status = ?,
                target_on = ?, previous_target_on = ?, previous_target_time = ?, due_rank = ?,
                updated_at = ?, updated_by_device = ?
            WHERE id = ? AND ${NOT_DELETED}`,
      params: [
        dose.periodId,
        dose.dueOn,
        dose.dueTime,
        dose.givenOn,
        dose.status,
        dose.targetOn,
        dose.previousTargetOn,
        dose.previousTargetTime,
        dose.dueRank,
        updatedAt,
        deviceId(),
        id,
      ],
    }
  }

  function markDeletedStatement(ids: readonly string[], deletedAt: string): SqlStatement {
    return {
      sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ?, updated_by_device = ?
            WHERE id IN (${placeholders(ids)}) AND ${NOT_DELETED}`,
      params: [deletedAt, deletedAt, deviceId(), ...ids],
    }
  }

  function reviveStatement(id: string, updatedAt: string): SqlStatement {
    return {
      sql: `UPDATE treatment_dose SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
            WHERE id = ?`,
      params: [updatedAt, deviceId(), id],
    }
  }

  return {
    insertStatement,
    createStatement,
    rewriteStatement,
    markDeletedStatement,
    reviveStatement,
  }
}
