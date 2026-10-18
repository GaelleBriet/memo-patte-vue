import type { SqlParam } from '@/core/db/db-client'
import type { Stamped } from '@/shared/domain/carnet-data'
import type { DoseFields, NewTreatmentDose, TreatmentDose } from '../schema/treatment-dose.schema'
import type { FrequencyUnit } from '../schema/treatment.schema'

export interface DoseRow {
  id: string
  period_id: string
  treatment_id: string
  animal_id: string
  due_on: string
  due_time: string | null
  given_on: string | null
  status: TreatmentDose['status']
  target_on: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

export interface DoseWithFrequencyRow extends DoseRow {
  frequency_value: number
  frequency_unit: FrequencyUnit
}

export type DoseVersionRow = Pick<
  DoseRow,
  'id' | 'period_id' | 'treatment_id' | 'updated_at' | 'deleted_at'
>

export const COLUMNS =
  'id, period_id, treatment_id, animal_id, due_on, due_time, given_on, status, target_on, ' +
  'created_at, updated_at, deleted_at, created_by_device, updated_by_device'

const COLUMN_NAMES = COLUMNS.split(', ')
export const PLACEHOLDERS = COLUMN_NAMES.map(() => '?').join(', ')

export const NOT_DELETED = 'deleted_at IS NULL'

/** Une prise lue porte la fréquence de sa période : elle n'est jamais recopiée. */
export const WITH_FREQUENCY = `
  SELECT ${COLUMN_NAMES.map((column) => `dose.${column}`).join(', ')},
         period.frequency_value, period.frequency_unit
  FROM treatment_dose dose
  JOIN treatment_period period ON period.id = dose.period_id`

export const HEAD_FIRST = 'dose.due_on DESC, dose.due_time DESC, dose.created_at DESC, dose.id DESC'

export function toDose(row: DoseWithFrequencyRow): TreatmentDose {
  return {
    id: row.id,
    periodId: row.period_id,
    treatmentId: row.treatment_id,
    animalId: row.animal_id,
    dueOn: row.due_on,
    dueTime: row.due_time,
    givenOn: row.given_on,
    status: row.status,
    targetOn: row.target_on,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function toRecord(row: DoseWithFrequencyRow): Stamped<TreatmentDose> {
  return {
    ...toDose(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}

export function valuesOf(dose: Stamped<NewTreatmentDose>): SqlParam[] {
  return [
    dose.id,
    dose.periodId,
    dose.treatmentId,
    dose.animalId,
    dose.dueOn,
    dose.dueTime,
    dose.givenOn,
    dose.status,
    dose.targetOn,
    dose.createdAt,
    dose.updatedAt,
    dose.deletedAt,
    dose.createdByDevice,
    dose.updatedByDevice,
  ]
}

export function fieldsOf(row: DoseRow): DoseFields {
  return {
    periodId: row.period_id,
    dueOn: row.due_on,
    dueTime: row.due_time,
    givenOn: row.given_on,
    status: row.status,
    targetOn: row.target_on,
  }
}

export function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}
