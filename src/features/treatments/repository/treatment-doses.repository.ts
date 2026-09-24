import type { SqlStatement } from '@/core/db/db-client'
import type { TreatmentDose } from '../schema/treatment-dose.schema'

export type RestoredTreatmentDose = Omit<TreatmentDose, 'deletedAt'>

const COLUMNS =
  'id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at, deleted_at'

const NOT_DELETED = 'deleted_at IS NULL'

/**
 * Sous-requête de la tête d'un traitement (`treatmentId` est une expression SQL) : la prise non
 * supprimée la plus récente par date, puis par saisie, puis par identifiant.
 */
export function headDoseIdSql(treatmentId: string): string {
  return `(SELECT candidate.id FROM treatment_dose candidate
           WHERE candidate.treatment_id = ${treatmentId} AND candidate.deleted_at IS NULL
           ORDER BY candidate.given_on DESC, candidate.created_at DESC, candidate.id DESC
           LIMIT 1)`
}

/** Instructions fournies sans être exécutées : le repository des traitements ou un service les joue. */
export function createTreatmentDosesRepository() {
  return {
    insertStatement(dose: TreatmentDose): SqlStatement {
      return {
        sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          dose.id,
          dose.treatmentId,
          dose.animalId,
          dose.givenOn,
          dose.nextDueDate,
          dose.frequency.value,
          dose.frequency.unit,
          dose.createdAt,
          dose.updatedAt,
          dose.deletedAt,
        ],
      }
    },

    updateHeadStatement(
      treatmentId: string,
      {
        givenOn,
        nextDueDate,
        frequency,
        updatedAt,
      }: Pick<TreatmentDose, 'givenOn' | 'nextDueDate' | 'frequency' | 'updatedAt'>,
    ): SqlStatement {
      return {
        sql: `UPDATE treatment_dose
              SET given_on = ?, next_due_date = ?, frequency_value = ?, frequency_unit = ?, updated_at = ?
              WHERE id = ${headDoseIdSql('?')}`,
        params: [givenOn, nextDueDate, frequency.value, frequency.unit, updatedAt, treatmentId],
      }
    },

    markDeletedByTreatmentStatement(treatmentId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE treatment_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, treatmentId],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt],
      }
    },

    /** Reprend les dates du fichier et rend la prise visible, sans la changer de traitement ni d'animal. */
    restoreStatement(dose: RestoredTreatmentDose): SqlStatement {
      return {
        sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
              ON CONFLICT (id) DO UPDATE SET
                given_on = excluded.given_on, next_due_date = excluded.next_due_date,
                frequency_value = excluded.frequency_value, frequency_unit = excluded.frequency_unit,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = NULL`,
        params: [
          dose.id,
          dose.treatmentId,
          dose.animalId,
          dose.givenOn,
          dose.nextDueDate,
          dose.frequency.value,
          dose.frequency.unit,
          dose.createdAt,
          dose.updatedAt,
        ],
      }
    },
  }
}

export type TreatmentDosesRepository = ReturnType<typeof createTreatmentDosesRepository>

const repository = createTreatmentDosesRepository()

export function getTreatmentDosesRepository(): TreatmentDosesRepository {
  return repository
}
