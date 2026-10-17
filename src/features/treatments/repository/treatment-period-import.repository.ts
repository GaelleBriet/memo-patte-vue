import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { TreatmentPeriod } from '../schema/treatment-period.schema'
import {
  SYNC_COLUMN_NAMES,
  SYNC_COLUMNS,
  flag,
  timesColumn,
  type PeriodRow,
  type StampedTreatmentPeriod,
} from './treatment-period-row.repository'

export type RestoredTreatmentPeriod = Omit<StampedTreatmentPeriod, 'deletedAt'>
export type TreatmentPeriodVersion = Pick<
  TreatmentPeriod,
  'id' | 'treatmentId' | 'animalId' | 'updatedAt' | 'deletedAt'
>

export function createPeriodImport(db: DbClient, deviceId: () => string) {
  return {
    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<TreatmentPeriodVersion[]> {
      const rows = await db.query<
        Pick<PeriodRow, 'id' | 'treatment_id' | 'animal_id' | 'updated_at' | 'deleted_at'>
      >('SELECT id, treatment_id, animal_id, updated_at, deleted_at FROM treatment_period')
      return rows.map((row) => ({
        id: row.id,
        treatmentId: row.treatment_id,
        animalId: row.animal_id,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      }))
    },

    /** Une période existante garde son traitement et son animal : ses réglages suivent le fichier. */
    restoreStatement(period: RestoredTreatmentPeriod, exists: boolean): SqlStatement {
      const values = [
        period.startsOn,
        period.firstDueOn,
        period.gridOriginOn,
        flag(period.firstDueChosen),
        flag(period.pastDosesStayUnlogged),
        period.endsOn,
        period.stoppedOn,
        period.frequency.value,
        period.frequency.unit,
        timesColumn(period.times),
        period.doseQuantity,
        period.doseUnit,
        period.reminderOffsetMinutes,
        period.reminderTime,
        period.createdAt,
        period.updatedAt,
        period.settingsWrittenAt,
      ]
      const devices = [period.createdByDevice, period.updatedByDevice]
      return exists
        ? {
            sql: `UPDATE treatment_period
                  SET starts_on = ?, first_due_on = ?, grid_origin_on = ?, first_due_chosen = ?,
                      past_doses_stay_unlogged = ?, ends_on = ?, stopped_on = ?,
                      frequency_value = ?, frequency_unit = ?, times = ?, dose_quantity = ?,
                      dose_unit = ?, reminder_offset_minutes = ?, reminder_time = ?,
                      created_at = ?, updated_at = ?, settings_written_at = ?, deleted_at = NULL,
                      created_by_device = ?, updated_by_device = ?
                  WHERE id = ?`,
            params: [...values, ...devices, period.id],
          }
        : {
            sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
                  VALUES (${SYNC_COLUMN_NAMES.map((column) => (column === 'deleted_at' ? 'NULL' : '?')).join(', ')})`,
            params: [period.id, period.treatmentId, period.animalId, ...values, ...devices],
          }
    },

    reviveStatement(id: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE id = ?`,
        params: [updatedAt, deviceId(), id],
      }
    },
  }
}
