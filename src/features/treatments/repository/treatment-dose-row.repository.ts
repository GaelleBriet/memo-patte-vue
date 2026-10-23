import type { SqlParam } from '@/core/db/db-client'
import type { Stamped } from '@/shared/domain/carnet-data'
import type { DoseFields, TreatmentDose } from '../schema/treatment-dose.schema'

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
  previous_target_on: string | null
  previous_target_time: string | null
  due_rank: number | null
  created_at: string
  updated_at: string
  decided_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

export type DoseVersionRow = Pick<
  DoseRow,
  'id' | 'period_id' | 'treatment_id' | 'updated_at' | 'deleted_at'
>

export const COLUMNS =
  'id, period_id, treatment_id, animal_id, due_on, due_time, given_on, status, target_on, ' +
  'previous_target_on, previous_target_time, due_rank, ' +
  'created_at, updated_at, decided_at, deleted_at, created_by_device, updated_by_device'

const COLUMN_NAMES = COLUMNS.split(', ')
export const PLACEHOLDERS = COLUMN_NAMES.map(() => '?').join(', ')

export const NOT_DELETED = 'deleted_at IS NULL'

export const FROM_DOSES = `SELECT ${COLUMNS} FROM treatment_dose dose`

export const HEAD_FIRST = 'dose.due_on DESC, dose.due_time DESC, dose.created_at DESC, dose.id DESC'

export function toDose(row: DoseRow): TreatmentDose {
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
    previousTargetOn: row.previous_target_on,
    previousTargetTime: row.previous_target_time,
    dueRank: row.due_rank,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
    deletedAt: row.deleted_at,
  }
}

export function toRecord(row: DoseRow): Stamped<TreatmentDose> {
  return {
    ...toDose(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}

export function valuesOf(dose: Stamped<TreatmentDose>): SqlParam[] {
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
    dose.previousTargetOn,
    dose.previousTargetTime,
    dose.dueRank,
    dose.createdAt,
    dose.updatedAt,
    dose.decidedAt,
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
    previousTargetOn: row.previous_target_on,
    previousTargetTime: row.previous_target_time,
    dueRank: row.due_rank,
  }
}

export function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}
