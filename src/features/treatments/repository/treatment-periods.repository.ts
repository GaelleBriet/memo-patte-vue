import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import type { TreatmentFrequency } from '../schema/treatment.schema'
import type { TreatmentPeriod, TreatmentPeriodRecord } from '../schema/treatment-period.schema'

export type RestoredTreatmentPeriod = Omit<TreatmentPeriodRecord, 'deletedAt'>
export type TreatmentPeriodVersion = Pick<
  TreatmentPeriod,
  'id' | 'treatmentId' | 'animalId' | 'updatedAt' | 'deletedAt'
>

interface PeriodRow {
  id: string
  treatment_id: string
  animal_id: string
  starts_on: string
  first_due_on: string
  ends_on: string | null
  stopped_on: string | null
  frequency_value: number
  frequency_unit: TreatmentFrequency['unit']
  times: string | null
  dose_quantity: number | null
  dose_unit: string | null
  reminder_offset_minutes: number | null
  reminder_time: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

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

const TIMES_SEPARATOR = ','

function toPeriodRecord(row: PeriodRow): TreatmentPeriodRecord {
  return {
    id: row.id,
    treatmentId: row.treatment_id,
    animalId: row.animal_id,
    startsOn: row.starts_on,
    firstDueOn: row.first_due_on,
    endsOn: row.ends_on,
    stoppedOn: row.stopped_on,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    times: row.times ? row.times.split(TIMES_SEPARATOR) : [],
    doseQuantity: row.dose_quantity,
    doseUnit: row.dose_unit as TreatmentPeriodRecord['doseUnit'],
    reminderOffsetMinutes:
      row.reminder_offset_minutes as TreatmentPeriodRecord['reminderOffsetMinutes'],
    reminderTime: row.reminder_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
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

    /**
     * « Modifier » corrige la période en cours ; une reprise la remet en cours. Une période que
     * rien ne change n'est pas datée : sa version resterait sinon la plus récente à la fusion.
     */
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
              WHERE id = ${currentPeriodIdSql('?')}
                AND (frequency_value <> ? OR frequency_unit <> ?
                     ${resume ? 'OR stopped_on IS NOT NULL' : ''})`,
        params: [
          frequency.value,
          frequency.unit,
          updatedAt,
          treatmentId,
          frequency.value,
          frequency.unit,
        ],
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

    /** Périodes visibles, toutes colonnes comprises, celles d'un même traitement de la première à la dernière. */
    async listAll(): Promise<TreatmentPeriodRecord[]> {
      const rows = await db.query<PeriodRow>(
        `SELECT ${SYNC_COLUMNS} FROM treatment_period WHERE ${NOT_DELETED}
         ORDER BY treatment_id, starts_on, created_at, id`,
      )
      return rows.map(toPeriodRecord)
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<TreatmentPeriodVersion[]> {
      const rows = await db.query<
        Pick<PeriodRow, 'id' | 'treatment_id' | 'animal_id' | 'updated_at' | 'deleted_at'>
      >('SELECT id, treatment_id, animal_id, updated_at, deleted_at FROM treatment_period')
      return rows.map((row) => ({
        id: row.id,
        treatmentId: row.treatment_id,
        animalId: row.animal_id,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      }))
    },

    /** Une période existante garde son traitement et son animal : ses réglages suivent le fichier. */
    restoreStatement(period: RestoredTreatmentPeriod, exists: boolean): SqlStatement {
      const values = [
        period.startsOn,
        period.firstDueOn,
        period.endsOn,
        period.stoppedOn,
        period.frequency.value,
        period.frequency.unit,
        period.times.length > 0 ? period.times.join(TIMES_SEPARATOR) : null,
        period.doseQuantity,
        period.doseUnit,
        period.reminderOffsetMinutes,
        period.reminderTime,
        period.createdAt,
        period.updatedAt,
      ]
      return exists
        ? {
            sql: `UPDATE treatment_period
                  SET starts_on = ?, first_due_on = ?, ends_on = ?, stopped_on = ?,
                      frequency_value = ?, frequency_unit = ?, times = ?, dose_quantity = ?,
                      dose_unit = ?, reminder_offset_minutes = ?, reminder_time = ?,
                      created_at = ?, updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [...values, period.id],
          }
        : {
            sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            params: [period.id, period.treatmentId, period.animalId, ...values],
          }
    },

    reviveStatement(id: string, updatedAt: string): SqlStatement {
      return {
        sql: 'UPDATE treatment_period SET deleted_at = NULL, updated_at = ? WHERE id = ?',
        params: [updatedAt, id],
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
