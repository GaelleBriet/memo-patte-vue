import type { TreatmentFrequency } from '../schema/treatment.schema'
import { calendarDaySchema, type TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Stamped } from '@/shared/domain/carnet-data'
import type { FallenDosesAnswer } from '@/shared/domain/dose-calendar'

export type StampedTreatmentPeriod = Stamped<TreatmentPeriodRecord>

export interface PeriodRow {
  id: string
  treatment_id: string
  animal_id: string
  starts_on: string
  first_due_on: string
  grid_origin_on: string | null
  first_due_chosen: number
  fallen_doses_answer: FallenDosesAnswer
  ends_on: string | null
  stopped_on: string | null
  frequency_value: number
  frequency_unit: TreatmentFrequency['unit']
  times: string | null
  dose_quantity: number | null
  dose_unit: string | null
  reminder_offset_minutes: number | null
  reminder_time: string | null
  created_at: string
  updated_at: string
  settings_written_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

export const NOT_DELETED = 'deleted_at IS NULL'

export const SYNC_COLUMN_NAMES = [
  'id',
  'treatment_id',
  'animal_id',
  'starts_on',
  'first_due_on',
  'grid_origin_on',
  'first_due_chosen',
  'fallen_doses_answer',
  'ends_on',
  'stopped_on',
  'frequency_value',
  'frequency_unit',
  'times',
  'dose_quantity',
  'dose_unit',
  'reminder_offset_minutes',
  'reminder_time',
  'created_at',
  'updated_at',
  'settings_written_at',
  'deleted_at',
  'created_by_device',
  'updated_by_device',
]
export const SYNC_COLUMNS = SYNC_COLUMN_NAMES.join(', ')

const TIMES_SEPARATOR = ','

export function originOf(gridOriginOn: string | null): string | null {
  return gridOriginOn === null ? null : calendarDaySchema.parse(gridOriginOn)
}

export const flag = (value: boolean) => (value ? 1 : 0)

export function timesColumn(times: readonly string[]): string | null {
  return times.length > 0 ? times.join(TIMES_SEPARATOR) : null
}

export function toPeriodRecord(row: PeriodRow): TreatmentPeriodRecord {
  return {
    id: row.id,
    treatmentId: row.treatment_id,
    animalId: row.animal_id,
    startsOn: row.starts_on,
    firstDueOn: row.first_due_on,
    gridOriginOn: row.grid_origin_on,
    firstDueChosen: row.first_due_chosen === 1,
    fallenDosesAnswer: row.fallen_doses_answer,
    endsOn: row.ends_on,
    stoppedOn: row.stopped_on,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    times: row.times ? row.times.split(TIMES_SEPARATOR) : [],
    doseQuantity: row.dose_quantity,
    doseUnit: row.dose_unit as TreatmentPeriodRecord['doseUnit'],
    reminderOffsetMinutes:
      row.reminder_offset_minutes as TreatmentPeriodRecord['reminderOffsetMinutes'],
    reminderTime: row.reminder_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    settingsWrittenAt: row.settings_written_at,
    deletedAt: row.deleted_at,
  }
}

export function toStampedPeriod(row: PeriodRow): StampedTreatmentPeriod {
  return {
    ...toPeriodRecord(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}
