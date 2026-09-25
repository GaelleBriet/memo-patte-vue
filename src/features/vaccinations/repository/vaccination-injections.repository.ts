import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'

export type RestoredVaccinationInjection = Omit<VaccinationInjection, 'deletedAt'>
export type VaccinationInjectionVersion = Pick<
  VaccinationInjection,
  'id' | 'vaccinationId' | 'injectedOn' | 'updatedAt' | 'deletedAt'
>

export type InjectionDates = Pick<VaccinationInjection, 'injectedOn' | 'nextDueDate'>

interface InjectionRow {
  id: string
  vaccination_id: string
  animal_id: string
  injected_on: string
  next_due_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

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

function toInjection(row: InjectionRow): VaccinationInjection {
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

export interface VaccinationInjectionsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

/**
 * Écrit seul une injection notée ou annulée ; ses autres écritures sont des instructions que le
 * repository des vaccins ou un service joue.
 */
export function createVaccinationInjectionsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
  }: VaccinationInjectionsRepositoryDependencies = {},
) {
  function insertStatement(injection: VaccinationInjection): SqlStatement {
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
  }

  return {
    entity: 'vaccination_injection',

    async record(injection: VaccinationInjection): Promise<void> {
      const { sql, params } = insertStatement(injection)
      await db.run(sql, params)
    },

    /** Injections visibles, la tête d'abord. */
    async listByVaccination(vaccinationId: string): Promise<VaccinationInjection[]> {
      const rows = await db.query<InjectionRow>(
        `SELECT ${COLUMNS} FROM vaccination_injection WHERE vaccination_id = ? AND ${NOT_DELETED}
         ORDER BY injected_on DESC, created_at DESC, id DESC`,
        [vaccinationId],
      )
      return rows.map(toInjection)
    },

    async getById(id: string): Promise<VaccinationInjection | null> {
      const rows = await db.query<InjectionRow>(
        `SELECT ${COLUMNS} FROM vaccination_injection WHERE id = ? AND ${NOT_DELETED}`,
        [id],
      )
      const row = rows[0]
      return row ? toInjection(row) : null
    },

    /**
     * Faux pour une injection déjà supprimée ou la seule visible de son vaccin : un vaccin garde
     * toujours au moins une injection.
     */
    async remove(id: string, deletedAt: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}
           AND EXISTS (
             SELECT 1 FROM vaccination_injection other
             WHERE other.vaccination_id = vaccination_injection.vaccination_id
               AND other.id <> vaccination_injection.id AND other.deleted_at IS NULL)`,
        [deletedAt, deletedAt, id],
      )
      return changes > 0
    },

    /** Faux pour une injection encore visible. */
    async revive(id: string, updatedAt: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE vaccination_injection SET deleted_at = NULL, updated_at = ?
         WHERE id = ? AND deleted_at IS NOT NULL`,
        [updatedAt, id],
      )
      return changes > 0
    },

    /** Faux pour une injection supprimée. */
    async changeDate(id: string, dates: InjectionDates, updatedAt: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE vaccination_injection SET injected_on = ?, next_due_date = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [dates.injectedOn, dates.nextDueDate, updatedAt, id],
      )
      return changes > 0
    },

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

    insertStatement,

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

    reviveStatement(id: string, updatedAt: string): SqlStatement {
      return {
        sql: 'UPDATE vaccination_injection SET deleted_at = NULL, updated_at = ? WHERE id = ?',
        params: [updatedAt, id],
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

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<InjectionRow>(
        `SELECT ${COLUMNS} FROM vaccination_injection WHERE id = ?`,
        [id],
      )
      return (rows[0] as SyncRow | undefined) ?? null
    },

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'vaccination_injection', ['user_id', 'id'], {
        ...row,
        user_id: userId,
      })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('vaccination_injection')
        .select(`${COLUMNS}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as Array<InjectionRow & { server_updated_at: string }>
      const cursor = rows.length > 0 ? (rows.at(-1)?.server_updated_at ?? null) : null
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...columns }) => columns as SyncRow),
        cursor,
      }
    },

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO vaccination_injection (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                vaccination_id = excluded.vaccination_id, animal_id = excluded.animal_id,
                injected_on = excluded.injected_on, next_due_date = excluded.next_due_date,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > vaccination_injection.updated_at`,
        params: [
          row.id,
          syncField(row, 'vaccination_id'),
          syncField(row, 'animal_id'),
          syncField(row, 'injected_on'),
          syncField(row, 'next_due_date'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
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
