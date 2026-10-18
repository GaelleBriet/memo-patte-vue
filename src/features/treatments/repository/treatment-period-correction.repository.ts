import type { SqlStatement } from '@/core/db/db-client'
import {
  treatmentPeriodSettingsSchema,
  type PeriodOrigin,
  type TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import { flag, listedColumn, originOf, timesColumn } from './treatment-period-row.repository'

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

export function createPeriodCorrection(deviceId: () => string) {
  return {
    /**
     * Tous les réglages de cette période et son origine, sauf son arrêt. Rien n'est daté si rien ne
     * change ; la date d'écriture des réglages ne suit que le calendrier, celle de la réponse Q38
     * et les échéances qu'elle a montrées seulement `answered`. Lève pour des réglages incohérents.
     */
    correctSettingsStatement(
      periodId: string,
      input: TreatmentPeriodSettings,
      updatedAt: string,
      origin: PeriodOrigin & { answered?: { listed: readonly string[] } },
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
      const isCalendar = (_: unknown, index: number) =>
        CALENDAR_COLUMNS.includes(CORRECTED_COLUMNS[index]!)
      const changed = (columns: string[]) =>
        columns.map((column) => `${column} IS NOT ?`).join(' OR ')
      const answered = origin.answered === undefined ? 0 : 1
      return {
        sql: `UPDATE treatment_period
              SET ${CORRECTED_COLUMNS.map((column) => `${column} = ?`).join(', ')},
                  settings_written_at = CASE WHEN ${changed(CORRECTED_COLUMNS.filter(isCalendar))}
                    THEN ? ELSE settings_written_at END,
                  fallen_doses_answered_at = CASE WHEN ? = 1 THEN ?
                    ELSE fallen_doses_answered_at END,
                  fallen_doses_listed = CASE WHEN ? = 1 THEN ? ELSE fallen_doses_listed END,
                  updated_at = ?, updated_by_device = ?
              WHERE id = ? AND (${changed(CORRECTED_COLUMNS)} OR ? = 1)`,
        params: [
          ...values,
          ...values.filter(isCalendar),
          updatedAt,
          answered,
          updatedAt,
          answered,
          listedColumn(origin.answered?.listed),
          updatedAt,
          deviceId(),
          periodId,
          ...values,
          answered,
        ],
      }
    },
  }
}
