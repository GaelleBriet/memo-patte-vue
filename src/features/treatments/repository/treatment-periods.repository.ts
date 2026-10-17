import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import type { TreatmentPeriod } from '../schema/treatment-period.schema'
import {
  NOT_DELETED,
  SYNC_COLUMN_NAMES,
  SYNC_COLUMNS,
  flag,
  timesColumn,
  type PeriodRow,
  type StampedTreatmentPeriod,
} from './treatment-period-row.repository'
import { createPeriodReads } from './treatment-period-reads.repository'
import { createPeriodCorrection } from './treatment-period-correction.repository'
import { createPeriodCreation } from './treatment-period-creation.repository'

export { currentPeriodIdSql } from './treatment-period-reads.repository'
export type { StampedTreatmentPeriod } from './treatment-period-row.repository'
export type RestoredTreatmentPeriod = Omit<StampedTreatmentPeriod, 'deletedAt'>
export type TreatmentPeriodVersion = Pick<
  TreatmentPeriod,
  'id' | 'treatmentId' | 'animalId' | 'updatedAt' | 'deletedAt'
>

export interface TreatmentPeriodsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

/**
 * Écrit seul l'arrêt d'une période ; ses autres écritures sont des instructions que le repository
 * des traitements ou un service joue.
 */
export function createTreatmentPeriodsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: TreatmentPeriodsRepositoryDependencies = {},
) {
  function stopStatement(
    periodId: string,
    stoppedOn: string,
    updatedAt: string,
  ): Required<SqlStatement> {
    return {
      sql: `UPDATE treatment_period SET stopped_on = ?, updated_at = ?, updated_by_device = ?
            WHERE id = ? AND stopped_on IS NULL AND ${NOT_DELETED}`,
      params: [stoppedOn, updatedAt, deviceId(), periodId],
    }
  }

  // Réinsère la période déjà arrêtée sous son propre identifiant : la clé primaire fait échouer le lot.
  function notStoppedGuardStatement(periodId: string): Required<SqlStatement> {
    return {
      sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
            SELECT ${SYNC_COLUMNS} FROM treatment_period
            WHERE id = ? AND stopped_on IS NOT NULL`,
      params: [periodId],
    }
  }

  function undoStopStatement(periodId: string, updatedAt: string): Required<SqlStatement> {
    return {
      sql: `UPDATE treatment_period SET stopped_on = NULL, updated_at = ?, updated_by_device = ?
            WHERE id = ? AND stopped_on IS NOT NULL`,
      params: [updatedAt, deviceId(), periodId],
    }
  }

  return {
    entity: 'treatment_period',

    ...createPeriodCreation(deviceId),

    ...createPeriodCorrection(deviceId),

    /** Faux quand la période est déjà arrêtée, ou inconnue : rien n'est écrit. */
    async stop(periodId: string, stoppedOn: string): Promise<boolean> {
      const { sql, params } = stopStatement(periodId, stoppedOn, new Date().toISOString())
      return (await db.run(sql, params)) > 0
    },

    async undoStop(periodId: string): Promise<void> {
      const { sql, params } = undoStopStatement(periodId, new Date().toISOString())
      await db.run(sql, params)
    },

    /** L'arrêt, à jouer dans la transaction des prises renseignées avec lui. */
    stopStatement,

    /** Fait échouer la transaction quand la période est déjà arrêtée. */
    notStoppedGuardStatement,

    undoStopStatement,

    /** Sans effet sur une période déjà arrêtée : sa date d'arrêt est gardée. */
    stopPeriodStatement(periodId: string, stoppedOn: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET stopped_on = ?, updated_at = ?, updated_by_device = ?
              WHERE id = ? AND stopped_on IS NULL`,
        params: [stoppedOn, updatedAt, deviceId(), periodId],
      }
    },

    /** Défait l'arrêt de `stopPeriodStatement`, seulement si la période est arrêtée ce jour-là. */
    undoStopPeriodStatement(periodId: string, stoppedOn: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET stopped_on = NULL, updated_at = ?, updated_by_device = ?
              WHERE id = ? AND stopped_on = ?`,
        params: [updatedAt, deviceId(), periodId, stoppedOn],
      }
    },

    markDeletedByTreatmentStatement(treatmentId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE treatment_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), treatmentId],
      }
    },

    /** Les périodes supprimées à cet instant, avec leur traitement. */
    reviveByTreatmentStatement(
      treatmentId: string,
      deletedAt: string,
      updatedAt: string,
    ): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE treatment_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), treatmentId, deletedAt],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
      }
    },

    /** Les lignes supprimées à cet instant, avec leur animal. */
    reviveByAnimalStatement(animalId: string, deletedAt: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), animalId, deletedAt],
      }
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM treatment_period' }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    ...createPeriodReads(db),

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
        period.gridOriginOn,
        flag(period.firstDueChosen),
        flag(period.pastDosesStayUnlogged),
        period.endsOn,
        period.stoppedOn,
        period.frequency.value,
        period.frequency.unit,
        timesColumn(period.times),
        period.doseQuantity,
        period.doseUnit,
        period.reminderOffsetMinutes,
        period.reminderTime,
        period.createdAt,
        period.updatedAt,
        period.settingsWrittenAt,
      ]
      const devices = [period.createdByDevice, period.updatedByDevice]
      return exists
        ? {
            sql: `UPDATE treatment_period
                  SET starts_on = ?, first_due_on = ?, grid_origin_on = ?, first_due_chosen = ?,
                      past_doses_stay_unlogged = ?, ends_on = ?, stopped_on = ?,
                      frequency_value = ?, frequency_unit = ?, times = ?, dose_quantity = ?,
                      dose_unit = ?, reminder_offset_minutes = ?, reminder_time = ?,
                      created_at = ?, updated_at = ?, settings_written_at = ?, deleted_at = NULL,
                      created_by_device = ?, updated_by_device = ?
                  WHERE id = ?`,
            params: [...values, ...devices, period.id],
          }
        : {
            sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
                  VALUES (${SYNC_COLUMN_NAMES.map((column) => (column === 'deleted_at' ? 'NULL' : '?')).join(', ')})`,
            params: [period.id, period.treatmentId, period.animalId, ...values, ...devices],
          }
    },

    reviveStatement(id: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE id = ?`,
        params: [updatedAt, deviceId(), id],
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

    ...createRemoteSyncTable({ table: 'treatment_period', columns: SYNC_COLUMNS, loadClient }),

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
