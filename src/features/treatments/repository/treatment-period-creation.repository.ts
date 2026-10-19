import type { SqlStatement } from '@/core/db/db-client'
import {
  treatmentPeriodSettingsSchema,
  type PeriodOrigin,
  type TreatmentPeriod,
  type TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import {
  SYNC_COLUMN_NAMES,
  SYNC_COLUMNS,
  flag,
  originOf,
  timesColumn,
} from './treatment-period-row.repository'

export function createPeriodCreation(deviceId: () => string) {
  return {
    /**
     * Fin, heures, posologie et moment du rappel absents : la période n'en a pas. Lève pour des
     * réglages incohérents.
     */
    insertStatement(
      period: TreatmentPeriod &
        Partial<TreatmentPeriodSettings> &
        PeriodOrigin & { deletedAt: string | null; gridWrittenAt?: string },
    ): SqlStatement {
      const settings = treatmentPeriodSettingsSchema.parse({
        startsOn: period.startsOn,
        firstDueOn: period.firstDueOn,
        endsOn: period.endsOn ?? null,
        frequency: period.frequency,
        times: period.times ?? [],
        doseQuantity: period.doseQuantity ?? null,
        doseUnit: period.doseUnit ?? null,
        reminderOffsetMinutes: period.reminderOffsetMinutes ?? null,
        reminderTime: period.reminderTime ?? null,
      })
      return {
        sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
              VALUES (${SYNC_COLUMN_NAMES.map(() => '?').join(', ')})`,
        params: [
          period.id,
          period.treatmentId,
          period.animalId,
          settings.startsOn,
          settings.firstDueOn,
          originOf(period.gridOriginOn),
          flag(period.firstDueChosen),
          period.fallenDosesAnswer,
          settings.endsOn,
          period.stoppedOn,
          settings.frequency.value,
          settings.frequency.unit,
          timesColumn(settings.times),
          settings.doseQuantity,
          settings.doseUnit,
          settings.reminderOffsetMinutes,
          settings.reminderTime,
          period.createdAt,
          period.updatedAt,
          period.createdAt,
          period.gridWrittenAt ?? period.createdAt,
          period.deletedAt,
          deviceId(),
          deviceId(),
        ],
      }
    },
  }
}
