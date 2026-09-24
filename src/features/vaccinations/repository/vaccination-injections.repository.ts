import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'

export type RestoredVaccinationInjection = Omit<VaccinationInjection, 'deletedAt'>
export type VaccinationInjectionVersion = Pick<
  VaccinationInjection,
  'id' | 'vaccinationId' | 'injectedOn' | 'updatedAt' | 'deletedAt'
>

interface InjectionVersionRow {
  id: string
  vaccination_id: string
  injected_on: string
  updated_at: string
  deleted_at: string | null
}

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

/** Ses écritures sont des instructions que le repository des vaccins ou un service joue. */
export function createVaccinationInjectionsRepository(db: DbClient) {
  return {
    /** Lignes supprimées comprises : l'import rattache un fichier aux injections déjà en base. */
    async listVersions(): Promise<VaccinationInjectionVersion[]> {
      const rows = await db.query<InjectionVersionRow>(
        'SELECT id, vaccination_id, injected_on, updated_at, deleted_at FROM vaccination_injection',
      )
      return rows.map((row) => ({
        id: row.id,
        vaccinationId: row.vaccination_id,
        injectedOn: row.injected_on,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      }))
    },

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

    /** Une injection existante garde sa date, son vaccin et son animal : seul le rappel suit le fichier. */
    restoreStatement(injection: RestoredVaccinationInjection, exists: boolean): SqlStatement {
      return exists
        ? {
            sql: `UPDATE vaccination_injection
                  SET next_due_date = ?, updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [injection.nextDueDate, injection.updatedAt, injection.id],
          }
        : {
            sql: `INSERT INTO vaccination_injection (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
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

let repository: Promise<VaccinationInjectionsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getVaccinationInjectionsRepository(): Promise<VaccinationInjectionsRepository> {
  repository ??= getDb()
    .then(createVaccinationInjectionsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
