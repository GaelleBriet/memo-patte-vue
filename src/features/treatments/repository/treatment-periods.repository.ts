import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import type { TreatmentFrequency } from '../schema/treatment.schema'
import type { TreatmentPeriod } from '../schema/treatment-period.schema'

export type RestoredTreatmentPeriod = Omit<TreatmentPeriod, 'deletedAt'>

const NOT_DELETED = 'deleted_at IS NULL'

const SYNC_COLUMN_NAMES = [
  'id',
  'treatment_id',
  'animal_id',
  'starts_on',
  'first_due_on',
  'ends_on',
  'stopped_on',
  'frequency_value',
  'frequency_unit',
  'times',
  'dose_quantity',
  'dose_unit',
  'reminder_offset_minutes',
  'reminder_time',
  'created_at',
  'updated_at',
  'deleted_at',
]
const SYNC_COLUMNS = SYNC_COLUMN_NAMES.join(', ')

export interface TreatmentPeriodsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

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
export function createTreatmentPeriodsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
  }: TreatmentPeriodsRepositoryDependencies = {},
) {
  return {
    entity: 'treatment_period',

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

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<SyncRow>(
        `SELECT ${SYNC_COLUMNS} FROM treatment_period WHERE id = ?`,
        [id],
      )
      return rows[0] ?? null
    },

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'treatment_period', ['user_id', 'id'], {
        ...row,
        user_id: userId,
      })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('treatment_period')
        .select(`${SYNC_COLUMNS}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as unknown as Array<SyncRow & { server_updated_at: string }>
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...columns }) => columns as SyncRow),
        cursor: rows.at(-1)?.server_updated_at ?? null,
      }
    },

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
              VALUES (${SYNC_COLUMN_NAMES.map(() => '?').join(', ')})
              ON CONFLICT (id) DO UPDATE SET
                ${SYNC_COLUMN_NAMES.slice(1)
                  .map((column) => `${column} = excluded.${column}`)
                  .join(', ')}
              WHERE excluded.updated_at > treatment_period.updated_at`,
        params: SYNC_COLUMN_NAMES.map((column) => syncField(row, column)),
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
