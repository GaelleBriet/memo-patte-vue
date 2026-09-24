import type { DbClient, SqlParam, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import type { TreatmentDose } from '../schema/treatment-dose.schema'

export type RestoredTreatmentDose = Omit<TreatmentDose, 'deletedAt'>
export type TreatmentDoseVersion = Pick<
  TreatmentDose,
  'id' | 'treatmentId' | 'givenOn' | 'updatedAt' | 'deletedAt'
>

interface DoseVersionRow {
  id: string
  treatment_id: string
  given_on: string
  updated_at: string
  deleted_at: string | null
}

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

function valuesOf(dose: TreatmentDose): SqlParam[] {
  return [
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
  ]
}

/**
 * Écrit seul une prise notée ou annulée ; ses autres écritures sont des instructions que le
 * repository des traitements ou un service joue.
 */
export function createTreatmentDosesRepository(db: DbClient) {
  return {
    /** Faux quand une prise visible du même jour existe déjà : un double tap n'en note qu'une. */
    async record(dose: TreatmentDose): Promise<boolean> {
      const changes = await db.run(
        `INSERT INTO treatment_dose (${COLUMNS})
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM treatment_dose
           WHERE treatment_id = ? AND given_on = ? AND ${NOT_DELETED}
         )`,
        [...valuesOf(dose), dose.treatmentId, dose.givenOn],
      )
      return changes > 0
    },

    /** Sans effet sur une prise déjà supprimée : sa date de suppression est gardée. */
    async remove(id: string, deletedAt: string): Promise<void> {
      await db.run(
        `UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
        [deletedAt, deletedAt, id],
      )
    },

    /** Lignes supprimées comprises : l'import rattache un fichier aux prises déjà en base. */
    async listVersions(): Promise<TreatmentDoseVersion[]> {
      const rows = await db.query<DoseVersionRow>(
        'SELECT id, treatment_id, given_on, updated_at, deleted_at FROM treatment_dose',
      )
      return rows.map((row) => ({
        id: row.id,
        treatmentId: row.treatment_id,
        givenOn: row.given_on,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      }))
    },

    insertStatement(dose: TreatmentDose): SqlStatement {
      return {
        sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: valuesOf(dose),
      }
    },

    /** La date de la prise ne change pas ici : la tête reste la même prise. */
    updateHeadStatement(
      treatmentId: string,
      {
        nextDueDate,
        frequency,
        updatedAt,
      }: Pick<TreatmentDose, 'nextDueDate' | 'frequency' | 'updatedAt'>,
    ): SqlStatement {
      return {
        sql: `UPDATE treatment_dose
              SET next_due_date = ?, frequency_value = ?, frequency_unit = ?, updated_at = ?
              WHERE id = ${headDoseIdSql('?')}`,
        params: [nextDueDate, frequency.value, frequency.unit, updatedAt, treatmentId],
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

    reviveStatement(id: string, updatedAt: string): SqlStatement {
      return {
        sql: 'UPDATE treatment_dose SET deleted_at = NULL, updated_at = ? WHERE id = ?',
        params: [updatedAt, id],
      }
    },

    /** Une prise existante garde sa date, son traitement et son animal : échéance et fréquence suivent le fichier. */
    restoreStatement(dose: RestoredTreatmentDose, exists: boolean): SqlStatement {
      return exists
        ? {
            sql: `UPDATE treatment_dose
                  SET next_due_date = ?, frequency_value = ?, frequency_unit = ?, updated_at = ?,
                      deleted_at = NULL
                  WHERE id = ?`,
            params: [
              dose.nextDueDate,
              dose.frequency.value,
              dose.frequency.unit,
              dose.updatedAt,
              dose.id,
            ],
          }
        : {
            sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
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

let repository: Promise<TreatmentDosesRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentDosesRepository(): Promise<TreatmentDosesRepository> {
  repository ??= getDb()
    .then(createTreatmentDosesRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
