import type { SqlStatement } from '@/core/db/db-client'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'

export type RestoredVaccinationInjection = Omit<VaccinationInjection, 'deletedAt'>

const COLUMNS =
  'id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at, deleted_at'

const NOT_DELETED = 'deleted_at IS NULL'

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

/** Instructions fournies sans être exécutées : le repository des vaccins ou un service les joue. */
export function createVaccinationInjectionsRepository() {
  return {
    insertStatement(injection: VaccinationInjection): SqlStatement {
      return {
        sql: `INSERT INTO vaccination_injection (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          injection.id,
          injection.vaccinationId,
          injection.animalId,
          injection.injectedOn,
          injection.nextDueDate,
          injection.createdAt,
          injection.updatedAt,
          injection.deletedAt,
        ],
      }
    },

    updateHeadStatement(
      vaccinationId: string,
      {
        injectedOn,
        nextDueDate,
        updatedAt,
      }: Pick<VaccinationInjection, 'injectedOn' | 'nextDueDate' | 'updatedAt'>,
    ): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET injected_on = ?, next_due_date = ?, updated_at = ?
              WHERE id = ${headInjectionIdSql('?')}`,
        params: [injectedOn, nextDueDate, updatedAt, vaccinationId],
      }
    },

    markDeletedByVaccinationStatement(vaccinationId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ? WHERE vaccination_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, vaccinationId],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ? WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt],
      }
    },

    /** Reprend les dates du fichier et rend l'injection visible, sans la changer de vaccin ni d'animal. */
    restoreStatement(injection: RestoredVaccinationInjection): SqlStatement {
      return {
        sql: `INSERT INTO vaccination_injection (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
              ON CONFLICT (id) DO UPDATE SET
                injected_on = excluded.injected_on, next_due_date = excluded.next_due_date,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = NULL`,
        params: [
          injection.id,
          injection.vaccinationId,
          injection.animalId,
          injection.injectedOn,
          injection.nextDueDate,
          injection.createdAt,
          injection.updatedAt,
        ],
      }
    },
  }
}

export type VaccinationInjectionsRepository = ReturnType<
  typeof createVaccinationInjectionsRepository
>

const repository = createVaccinationInjectionsRepository()

export function getVaccinationInjectionsRepository(): VaccinationInjectionsRepository {
  return repository
}
