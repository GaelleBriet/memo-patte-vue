import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Stamped } from '@/shared/domain/carnet-data'

export type VaccinationInjectionRecord = Stamped<VaccinationInjection>
export type RestoredVaccinationInjection = Omit<VaccinationInjectionRecord, 'deletedAt'>
export type VaccinationInjectionVersion = Pick<
  VaccinationInjection,
  'id' | 'vaccinationId' | 'updatedAt' | 'deletedAt'
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
  created_by_device: string
  updated_by_device: string
}

type InjectionVersionRow = Pick<InjectionRow, 'id' | 'vaccination_id' | 'updated_at' | 'deleted_at'>

const COLUMNS =
  'id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at, deleted_at, ' +
  'created_by_device, updated_by_device'

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

function toRecord(row: InjectionRow): VaccinationInjectionRecord {
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

export interface VaccinationInjectionsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

/**
 * Écrit seul une injection notée ou annulée ; ses autres écritures sont des instructions que le
 * repository des vaccins ou un service joue.
 */
export function createVaccinationInjectionsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: VaccinationInjectionsRepositoryDependencies = {},
) {
  function insertStatement(injection: VaccinationInjection): SqlStatement {
    return {
      sql: `INSERT INTO vaccination_injection (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        injection.id,
        injection.vaccinationId,
        injection.animalId,
        injection.injectedOn,
        injection.nextDueDate,
        injection.createdAt,
        injection.updatedAt,
        injection.deletedAt,
        deviceId(),
        deviceId(),
      ],
    }
  }

  async function getById(id: string): Promise<VaccinationInjection | null> {
    const rows = await db.query<InjectionRow>(
      `SELECT ${COLUMNS} FROM vaccination_injection WHERE id = ? AND ${NOT_DELETED}`,
      [id],
    )
    const row = rows[0]
    return row ? toInjection(row) : null
  }

  function reviveStatement(id: string, updatedAt: string): SqlStatement {
    return {
      sql: `UPDATE vaccination_injection SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
            WHERE id = ?`,
      params: [updatedAt, deviceId(), id],
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

    /** Injections visibles de tous les vaccins, celles d'un même vaccin la tête d'abord. */
    async listAll(): Promise<VaccinationInjectionRecord[]> {
      const rows = await db.query<InjectionRow>(
        `SELECT ${COLUMNS} FROM vaccination_injection WHERE ${NOT_DELETED}
         ORDER BY vaccination_id, injected_on DESC, created_at DESC, id DESC`,
      )
      return rows.map(toRecord)
    },

    getById,

    /** Faux pour une injection déjà supprimée ; `also` s'écrit dans la même transaction. */
    async remove(
      id: string,
      deletedAt: string,
      also: readonly SqlStatement[] = [],
    ): Promise<boolean> {
      if ((await getById(id)) === null) return false
      await db.runMany([
        {
          sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        ...also,
      ])
      return true
    },

    /** Faux pour une injection encore visible ; `also` s'écrit dans la même transaction. */
    async revive(
      id: string,
      updatedAt: string,
      also: readonly SqlStatement[] = [],
    ): Promise<boolean> {
      const deleted = await db.query<{ id: string }>(
        'SELECT id FROM vaccination_injection WHERE id = ? AND deleted_at IS NOT NULL',
        [id],
      )
      if (deleted.length === 0) return false
      await db.runMany([reviveStatement(id, updatedAt), ...also])
      return true
    },

    /** Faux pour une injection supprimée. */
    async changeDate(id: string, dates: InjectionDates, updatedAt: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE vaccination_injection
         SET injected_on = ?, next_due_date = ?, updated_at = ?, updated_by_device = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [dates.injectedOn, dates.nextDueDate, updatedAt, deviceId(), id],
      )
      return changes > 0
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<VaccinationInjectionVersion[]> {
      const rows = await db.query<InjectionVersionRow>(
        'SELECT id, vaccination_id, updated_at, deleted_at FROM vaccination_injection',
      )
      return rows.map((row) => ({
        id: row.id,
        vaccinationId: row.vaccination_id,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      }))
    },

    insertStatement,

    updateHeadDueStatement(
      vaccinationId: string,
      { nextDueDate, updatedAt }: Pick<VaccinationInjection, 'nextDueDate' | 'updatedAt'>,
    ): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection
              SET next_due_date = ?, updated_at = ?, updated_by_device = ?
              WHERE id = ${headInjectionIdSql('?')}`,
        params: [nextDueDate, updatedAt, deviceId(), vaccinationId],
      }
    },

    markDeletedByVaccinationStatement(vaccinationId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE vaccination_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), vaccinationId],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
      }
    },

    /** Les lignes supprimées à cet instant, avec leur animal. */
    reviveByAnimalStatement(animalId: string, deletedAt: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), animalId, deletedAt],
      }
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM vaccination_injection' }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    reviveStatement,

    /** Rétablit les injections supprimées avec leur vaccin, à cet instant précis. */
    reviveByVaccinationStatement(
      vaccinationId: string,
      deletedAt: string,
      updatedAt: string,
    ): SqlStatement {
      return {
        sql: `UPDATE vaccination_injection SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE vaccination_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), vaccinationId, deletedAt],
      }
    },

    /** Une injection existante garde son vaccin et son animal : sa date et son rappel suivent le fichier. */
    restoreStatement(injection: RestoredVaccinationInjection, exists: boolean): SqlStatement {
      return exists
        ? {
            sql: `UPDATE vaccination_injection
                  SET injected_on = ?, next_due_date = ?, created_at = ?, updated_at = ?,
                      deleted_at = NULL, created_by_device = ?, updated_by_device = ?
                  WHERE id = ?`,
            params: [
              injection.injectedOn,
              injection.nextDueDate,
              injection.createdAt,
              injection.updatedAt,
              injection.createdByDevice,
              injection.updatedByDevice,
              injection.id,
            ],
          }
        : {
            sql: `INSERT INTO vaccination_injection (${COLUMNS})
                  VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            params: [
              injection.id,
              injection.vaccinationId,
              injection.animalId,
              injection.injectedOn,
              injection.nextDueDate,
              injection.createdAt,
              injection.updatedAt,
              injection.createdByDevice,
              injection.updatedByDevice,
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
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                vaccination_id = excluded.vaccination_id, animal_id = excluded.animal_id,
                injected_on = excluded.injected_on, next_due_date = excluded.next_due_date,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at, created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
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
          syncField(row, 'created_by_device'),
          syncField(row, 'updated_by_device'),
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
