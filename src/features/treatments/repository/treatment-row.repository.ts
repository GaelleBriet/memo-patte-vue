import type { FrequencyUnit, Treatment, TreatmentType } from '../schema/treatment.schema'
import type { TreatmentRecord } from '../schema/treatment-with-periods.schema'
import type { Stamped } from '@/shared/domain/carnet-data'

export interface TreatmentRow {
  id: string
  animal_id: string
  name: string
  type: TreatmentType
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

export interface TreatmentWithPeriodRow extends Omit<
  TreatmentRow,
  'created_by_device' | 'updated_by_device'
> {
  period_id: string
  frequency_value: number
  frequency_unit: FrequencyUnit
  stopped_on: string | null
}

export type StampedTreatmentRecord = Stamped<TreatmentRecord>

export const COLUMNS =
  'id, animal_id, name, type, created_at, updated_at, deleted_at, created_by_device, updated_by_device'

/** Les traitements supprimés restent en base pour la synchronisation, jamais pour l'UI. */
export const NOT_DELETED = 'deleted_at IS NULL'

export function toRecord(row: TreatmentRow): TreatmentRecord {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    type: row.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toStampedRecord(row: TreatmentRow): StampedTreatmentRecord {
  return {
    ...toRecord(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}

export function toTreatment(row: TreatmentWithPeriodRow): Treatment {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    type: row.type,
    periodId: row.period_id,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    stoppedOn: row.stopped_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}
