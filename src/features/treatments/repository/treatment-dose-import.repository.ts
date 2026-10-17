import type { SqlStatement } from '@/core/db/db-client'
import type { Stamped } from '@/shared/domain/carnet-data'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import { COLUMNS, PLACEHOLDERS, valuesOf } from './treatment-dose-row.repository'

export type RestoredTreatmentDose = Omit<Stamped<NewTreatmentDose>, 'deletedAt'>

/** Une prise existante garde sa période, son traitement et son animal : le reste suit le fichier. */
export function restoreStatement(dose: RestoredTreatmentDose, exists: boolean): SqlStatement {
  return exists
    ? {
        sql: `UPDATE treatment_dose
                  SET due_on = ?, due_time = ?, given_on = ?, status = ?, target_on = ?,
                      created_at = ?, updated_at = ?, deleted_at = NULL, created_by_device = ?,
                      updated_by_device = ?
                  WHERE id = ?`,
        params: [
          dose.dueOn,
          dose.dueTime,
          dose.givenOn,
          dose.status,
          dose.targetOn,
          dose.createdAt,
          dose.updatedAt,
          dose.createdByDevice,
          dose.updatedByDevice,
          dose.id,
        ],
      }
    : {
        sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (${PLACEHOLDERS})`,
        params: valuesOf({ ...dose, deletedAt: null }),
      }
}
