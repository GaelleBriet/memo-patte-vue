import type { SqlStatement } from '@/core/db/db-client'
import {
  treatmentPeriodSettingsSchema,
  type PeriodOrigin,
  type TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import { flag, originOf, timesColumn } from './treatment-period-row.repository'

const SETTINGS_COLUMNS = [
  'starts_on',
  'first_due_on',
  'ends_on',
  'frequency_value',
  'frequency_unit',
  'times',
  'dose_quantity',
  'dose_unit',
  'reminder_offset_minutes',
  'reminder_time',
]

const CORRECTED_COLUMNS = [
  ...SETTINGS_COLUMNS,
  'grid_origin_on',
  'first_due_chosen',
  'fallen_doses_answer',
]

const CALENDAR_COLUMNS = [
  'starts_on',
  'first_due_on',
  'frequency_value',
  'frequency_unit',
  'times',
  'grid_origin_on',
  'first_due_chosen',
]

const GRID_COLUMNS = [
  'first_due_on',
  'frequency_value',
  'frequency_unit',
  'grid_origin_on',
  'ends_on',
]

export function createPeriodCorrection(deviceId: () => string) {
  return {
    /**
     * Tous les réglages de cette période et son origine, sauf son arrêt. Rien n'est daté si rien ne
     * change ; la date d'écriture des réglages ne suit que le calendrier. Lève pour des réglages
     * incohérents.
     */
    correctSettingsStatement(
      periodId: string,
      input: TreatmentPeriodSettings,
      updatedAt: string,
      origin: PeriodOrigin,
    ): SqlStatement {
      const settings = treatmentPeriodSettingsSchema.parse(input)
      const values = [
        settings.startsOn,
        settings.firstDueOn,
        settings.endsOn,
        settings.frequency.value,
        settings.frequency.unit,
        timesColumn(settings.times),
        settings.doseQuantity,
        settings.doseUnit,
        settings.reminderOffsetMinutes,
        settings.reminderTime,
        originOf(origin.gridOriginOn),
        flag(origin.firstDueChosen),
        origin.fallenDosesAnswer,
      ]
      const among = (columns: string[]) => (_: unknown, index: number) =>
        columns.includes(CORRECTED_COLUMNS[index]!)
      const changed = (columns: string[]) =>
        columns.map((column) => `${column} IS NOT ?`).join(' OR ')
      return {
        sql: `UPDATE treatment_period
              SET ${CORRECTED_COLUMNS.map((column) => `${column} = ?`).join(', ')},
                  settings_written_at = CASE WHEN ${changed(CORRECTED_COLUMNS.filter(among(CALENDAR_COLUMNS)))}
                    THEN ? ELSE settings_written_at END,
                  grid_written_at = CASE WHEN ${changed(CORRECTED_COLUMNS.filter(among(GRID_COLUMNS)))}
                    THEN ? ELSE grid_written_at END,
                  updated_at = ?, updated_by_device = ?
              WHERE id = ? AND (${changed(CORRECTED_COLUMNS)})`,
        params: [
          ...values,
          ...values.filter(among(CALENDAR_COLUMNS)),
          updatedAt,
          ...values.filter(among(GRID_COLUMNS)),
          updatedAt,
          updatedAt,
          deviceId(),
          periodId,
          ...values,
        ],
      }
    },
  }
}
