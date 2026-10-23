import { headInjectionIdSql } from './vaccination-injections.repository'
import type { Vaccination } from '../schema/vaccination.schema'
import type { DeviceStamps } from '@/shared/domain/carnet-data'

export interface VaccinationRow {
  id: string
  animal_id: string
  name: string
  planned_due_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

export interface VaccinationWithHeadRow extends Omit<
  VaccinationRow,
  'planned_due_date' | 'created_by_device' | 'updated_by_device'
> {
  last_injection_date: string | null
  due_date: string | null
}

export interface ReplacedDueRow {
  vaccination_id: string
  due_date: string
}

export type VaccinationVersion = Pick<Vaccination, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
/** Le vaccin tel que sa table l'enregistre, sans la tête de son historique. */
export type VaccinationRecord = Pick<
  Vaccination,
  'id' | 'animalId' | 'name' | 'createdAt' | 'updatedAt'
> & { plannedDueDate: string | null } & DeviceStamps
export type RestoredVaccination = VaccinationRecord

export const COLUMNS =
  'id, animal_id, name, planned_due_date, created_at, updated_at, deleted_at, created_by_device, ' +
  'updated_by_device'

/** Les vaccins supprimés restent en base pour la synchronisation, jamais pour l'UI. */
export const NOT_DELETED = 'deleted_at IS NULL'

/** Sans injection, le prochain rappel est le rappel prévu ; avec, celui de la dernière injection. */
export const VISIBLE_WITH_HEAD = `
  SELECT vaccination.id, vaccination.animal_id, vaccination.name,
         head.injected_on AS last_injection_date,
         CASE WHEN head.id IS NULL THEN vaccination.planned_due_date ELSE head.next_due_date END
           AS due_date,
         vaccination.created_at, vaccination.updated_at, vaccination.deleted_at
  FROM vaccination
  LEFT JOIN vaccination_injection head ON head.id = ${headInjectionIdSql('vaccination.id')}
  WHERE vaccination.deleted_at IS NULL`

/** Rappels qu'une injection plus récente a remplacés : ceux d'avant la tête, et le rendez-vous prévu. */
export const REPLACED_DUES = `
  SELECT vaccination.id AS vaccination_id, injection.next_due_date AS due_date
  FROM vaccination
  JOIN vaccination_injection injection ON injection.vaccination_id = vaccination.id
  WHERE vaccination.deleted_at IS NULL AND injection.deleted_at IS NULL
    AND injection.next_due_date IS NOT NULL
    AND injection.id <> ${headInjectionIdSql('vaccination.id')}
  UNION
  SELECT vaccination.id, vaccination.planned_due_date
  FROM vaccination
  WHERE vaccination.deleted_at IS NULL AND vaccination.planned_due_date IS NOT NULL
    AND ${headInjectionIdSql('vaccination.id')} IS NOT NULL`

export function toVaccination(row: VaccinationWithHeadRow): Vaccination {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    lastInjectionDate: row.last_injection_date,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function toVaccinationRecord(row: VaccinationRow): VaccinationRecord {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    plannedDueDate: row.planned_due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}
