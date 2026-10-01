import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import type { TreatmentFrequency } from '../schema/treatment.schema'
import type { TreatmentPeriod } from '../schema/treatment-period.schema'

export type RestoredTreatmentPeriod = Omit<TreatmentPeriod, 'deletedAt'>

const NOT_DELETED = 'deleted_at IS NULL'

/**
 * Sous-requête de la période en cours d'un traitement (`treatmentId` est une expression SQL) : la
 * période non supprimée qui commence le plus tard, puis la dernière saisie, puis par identifiant.
 */
export function currentPeriodIdSql(treatmentId: string): string {
  return `(SELECT candidate.id FROM treatment_period candidate
           WHERE candidate.treatment_id = ${treatmentId} AND candidate.deleted_at IS NULL
           ORDER BY candidate.starts_on DESC, candidate.created_at DESC, candidate.id DESC
           LIMIT 1)`
}

/**
 * Écrit seul l'arrêt d'une période ; ses autres écritures sont des instructions que le repository
 * des traitements ou un service joue.
 */
export function createTreatmentPeriodsRepository(db: DbClient) {
  return {
    insertStatement(period: TreatmentPeriod): SqlStatement {
      return {
        sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
                stopped_on, frequency_value, frequency_unit, created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          period.id,
          period.treatmentId,
          period.animalId,
          period.startsOn,
          period.firstDueOn,
          period.stoppedOn,
          period.frequency.value,
          period.frequency.unit,
          period.createdAt,
          period.updatedAt,
          period.deletedAt,
        ],
      }
    },

    /** « Modifier » corrige la période en cours ; une reprise la remet en cours. */
    correctCurrentStatement(
      treatmentId: string,
      {
        frequency,
        resume,
        updatedAt,
      }: { frequency: TreatmentFrequency; resume: boolean; updatedAt: string },
    ): SqlStatement {
      return {
        sql: `UPDATE treatment_period
              SET frequency_value = ?, frequency_unit = ?,
                  ${resume ? 'stopped_on = NULL, ' : ''}updated_at = ?
              WHERE id = ${currentPeriodIdSql('?')}`,
        params: [frequency.value, frequency.unit, updatedAt, treatmentId],
      }
    },

    /** Faux quand la période en cours est déjà arrêtée, ou que le traitement n'en a pas : rien n'est écrit. */
    async stop(treatmentId: string, stoppedOn: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE treatment_period SET stopped_on = ?, updated_at = ?
         WHERE id = ${currentPeriodIdSql('?')} AND stopped_on IS NULL`,
        [stoppedOn, new Date().toISOString(), treatmentId],
      )
      return changes > 0
    },

    async undoStop(treatmentId: string): Promise<void> {
      await db.run(
        `UPDATE treatment_period SET stopped_on = NULL, updated_at = ?
         WHERE id = ${currentPeriodIdSql('?')} AND stopped_on IS NOT NULL`,
        [new Date().toISOString(), treatmentId],
      )
    },

    markDeletedByTreatmentStatement(treatmentId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?
              WHERE treatment_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, treatmentId],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ? WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt],
      }
    },

    /** Une période existante garde son début et sa première échéance : le reste suit le fichier. */
    restoreStatement(period: RestoredTreatmentPeriod): SqlStatement {
      return {
        sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
                stopped_on, frequency_value, frequency_unit, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                stopped_on = excluded.stopped_on, frequency_value = excluded.frequency_value,
                frequency_unit = excluded.frequency_unit, updated_at = excluded.updated_at,
                deleted_at = NULL`,
        params: [
          period.id,
          period.treatmentId,
          period.animalId,
          period.startsOn,
          period.firstDueOn,
          period.stoppedOn,
          period.frequency.value,
          period.frequency.unit,
          period.createdAt,
          period.updatedAt,
        ],
      }
    },
  }
}

export type TreatmentPeriodsRepository = ReturnType<typeof createTreatmentPeriodsRepository>

let repository: Promise<TreatmentPeriodsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentPeriodsRepository(): Promise<TreatmentPeriodsRepository> {
  repository ??= getDb()
    .then(createTreatmentPeriodsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
