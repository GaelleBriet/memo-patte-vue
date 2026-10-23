import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Stamped } from '@/shared/domain/carnet-data'

export type VaccinationInjectionRecord = Stamped<VaccinationInjection>
export type RestoredVaccinationInjection = Omit<VaccinationInjectionRecord, 'deletedAt'>
export type VaccinationInjectionVersion = Pick<
  VaccinationInjection,
  'id' | 'vaccinationId' | 'updatedAt' | 'deletedAt'
>

export interface InjectionRow {
  id: string
  vaccination_id: string
  animal_id: string
  injected_on: string
  next_due_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

export type InjectionVersionRow = Pick<
  InjectionRow,
  'id' | 'vaccination_id' | 'updated_at' | 'deleted_at'
>

export const COLUMNS =
  'id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at, deleted_at, ' +
  'created_by_device, updated_by_device'

export const NOT_DELETED = 'deleted_at IS NULL'

export function toInjection(row: InjectionRow): VaccinationInjection {
  return {
    id: row.id,
    vaccinationId: row.vaccination_id,
    animalId: row.animal_id,
    injectedOn: row.injected_on,
    nextDueDate: row.next_due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function toRecord(row: InjectionRow): VaccinationInjectionRecord {
  return {
    ...toInjection(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}

/**
 * Sous-requête de la tête d'un vaccin (`vaccinationId` est une expression SQL) : l'injection non
 * supprimée la plus récente par date, puis par saisie, puis par identifiant.
 */
export function headInjectionIdSql(vaccinationId: string): string {
  return `(SELECT candidate.id FROM vaccination_injection candidate
           WHERE candidate.vaccination_id = ${vaccinationId} AND candidate.deleted_at IS NULL
           ORDER BY candidate.injected_on DESC, candidate.created_at DESC, candidate.id DESC
           LIMIT 1)`
}
