import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import type { TreatmentFrequency } from '../schema/treatment.schema'
import {
  calendarDaySchema,
  treatmentPeriodSettingsSchema,
  type TreatmentPeriod,
  type TreatmentPeriodRecord,
  type TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { Stamped } from '@/shared/domain/carnet-data'

export type StampedTreatmentPeriod = Stamped<TreatmentPeriodRecord>
export type RestoredTreatmentPeriod = Omit<StampedTreatmentPeriod, 'deletedAt'>
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
  reference_on: string
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
  created_by_device: string
  updated_by_device: string
}

const NOT_DELETED = 'deleted_at IS NULL'

const SYNC_COLUMN_NAMES = [
  'id',
  'treatment_id',
  'animal_id',
  'starts_on',
  'first_due_on',
  'reference_on',
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
  'created_by_device',
  'updated_by_device',
]
const SYNC_COLUMNS = SYNC_COLUMN_NAMES.join(', ')

export interface TreatmentPeriodsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

const TIMES_SEPARATOR = ','

const SETTINGS_COLUMNS = [
  'starts_on',
  'first_due_on',
  'ends_on',
  'frequency_value',
  'frequency_unit',
  'times',
  'dose_quantity',
  'dose_unit',
  'reminder_offset_minutes',
  'reminder_time',
]

function timesColumn(times: readonly string[]): string | null {
  return times.length > 0 ? times.join(TIMES_SEPARATOR) : null
}

function toPeriodRecord(row: PeriodRow): TreatmentPeriodRecord {
  return {
    id: row.id,
    treatmentId: row.treatment_id,
    animalId: row.animal_id,
    startsOn: row.starts_on,
    firstDueOn: row.first_due_on,
    referenceOn: row.reference_on,
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

function toStampedPeriod(row: PeriodRow): StampedTreatmentPeriod {
  return {
    ...toPeriodRecord(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
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
    deviceId = currentDeviceId,
  }: TreatmentPeriodsRepositoryDependencies = {},
) {
  async function visibleRows(scope = '', params: string[] = []): Promise<PeriodRow[]> {
    return db.query<PeriodRow>(
      `SELECT ${SYNC_COLUMNS} FROM treatment_period WHERE ${NOT_DELETED} ${scope}
       ORDER BY treatment_id, starts_on, created_at, id`,
      params,
    )
  }

  async function listVisible(scope = '', params: string[] = []): Promise<TreatmentPeriodRecord[]> {
    return (await visibleRows(scope, params)).map(toPeriodRecord)
  }

  function stopStatement(
    treatmentId: string,
    stoppedOn: string,
    updatedAt: string,
  ): Required<SqlStatement> {
    return {
      sql: `UPDATE treatment_period SET stopped_on = ?, updated_at = ?, updated_by_device = ?
            WHERE id = ${currentPeriodIdSql('?')} AND stopped_on IS NULL`,
      params: [stoppedOn, updatedAt, deviceId(), treatmentId],
    }
  }

  // Réinsère la période déjà arrêtée sous son propre identifiant : la clé primaire fait échouer le lot.
  function notStoppedGuardStatement(treatmentId: string): Required<SqlStatement> {
    return {
      sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
            SELECT ${SYNC_COLUMNS} FROM treatment_period
            WHERE id = ${currentPeriodIdSql('?')} AND stopped_on IS NOT NULL`,
      params: [treatmentId],
    }
  }

  function undoStopStatement(treatmentId: string, updatedAt: string): Required<SqlStatement> {
    return {
      sql: `UPDATE treatment_period SET stopped_on = NULL, updated_at = ?, updated_by_device = ?
            WHERE id = ${currentPeriodIdSql('?')} AND stopped_on IS NOT NULL`,
      params: [updatedAt, deviceId(), treatmentId],
    }
  }

  return {
    entity: 'treatment_period',

    /**
     * Fin, heures, posologie et moment du rappel absents : la période n'en a pas ; jour de
     * référence absent : sa première échéance. Lève pour des réglages incohérents.
     */
    insertStatement(
      period: TreatmentPeriod &
        Partial<TreatmentPeriodSettings> & { deletedAt: string | null; referenceOn?: string },
    ): SqlStatement {
      const settings = treatmentPeriodSettingsSchema.parse({
        startsOn: period.startsOn,
        firstDueOn: period.firstDueOn,
        endsOn: period.endsOn ?? null,
        frequency: period.frequency,
        times: period.times ?? [],
        doseQuantity: period.doseQuantity ?? null,
        doseUnit: period.doseUnit ?? null,
        reminderOffsetMinutes: period.reminderOffsetMinutes ?? null,
        reminderTime: period.reminderTime ?? null,
      })
      return {
        sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
              VALUES (${SYNC_COLUMN_NAMES.map(() => '?').join(', ')})`,
        params: [
          period.id,
          period.treatmentId,
          period.animalId,
          settings.startsOn,
          settings.firstDueOn,
          period.referenceOn ?? settings.firstDueOn,
          settings.endsOn,
          period.stoppedOn,
          settings.frequency.value,
          settings.frequency.unit,
          timesColumn(settings.times),
          settings.doseQuantity,
          settings.doseUnit,
          settings.reminderOffsetMinutes,
          settings.reminderTime,
          period.createdAt,
          period.updatedAt,
          period.deletedAt,
          deviceId(),
          deviceId(),
        ],
      }
    },

    /**
     * Tous les réglages de la période en cours, sauf son arrêt ; le jour de référence suit la
     * première échéance sauf mention. Rien n'est daté si rien ne change. Lève pour des réglages
     * incohérents.
     */
    correctCurrentSettingsStatement(
      treatmentId: string,
      input: TreatmentPeriodSettings,
      updatedAt: string,
      referenceOn?: string,
    ): SqlStatement {
      const settings = treatmentPeriodSettingsSchema.parse(input)
      const values = [
        settings.startsOn,
        settings.firstDueOn,
        settings.endsOn,
        settings.frequency.value,
        settings.frequency.unit,
        timesColumn(settings.times),
        settings.doseQuantity,
        settings.doseUnit,
        settings.reminderOffsetMinutes,
        settings.reminderTime,
      ]
      return {
        sql: `UPDATE treatment_period
              SET ${SETTINGS_COLUMNS.map((column) => `${column} = ?`).join(', ')},
                  reference_on = ?, updated_at = ?, updated_by_device = ?
              WHERE id = ${currentPeriodIdSql('?')}
                AND (${SETTINGS_COLUMNS.map((column) => `${column} IS NOT ?`).join(' OR ')})`,
        params: [
          ...values,
          calendarDaySchema.parse(referenceOn ?? settings.firstDueOn),
          updatedAt,
          deviceId(),
          treatmentId,
          ...values,
        ],
      }
    },

    /** Faux quand la période en cours est déjà arrêtée, ou que le traitement n'en a pas : rien n'est écrit. */
    async stop(treatmentId: string, stoppedOn: string): Promise<boolean> {
      const { sql, params } = stopStatement(treatmentId, stoppedOn, new Date().toISOString())
      return (await db.run(sql, params)) > 0
    },

    async undoStop(treatmentId: string): Promise<void> {
      const { sql, params } = undoStopStatement(treatmentId, new Date().toISOString())
      await db.run(sql, params)
    },

    /** L'arrêt, à jouer dans la transaction des prises renseignées avec lui. */
    stopStatement,

    /** Fait échouer la transaction quand la période en cours est déjà arrêtée. */
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

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    /** Périodes visibles, toutes colonnes comprises, celles d'un même traitement de la première à la dernière. */
    listAll(): Promise<TreatmentPeriodRecord[]> {
      return listVisible()
    },

    /** Comme `listAll`, appareils compris : ce que l'export emporte. */
    async listRecords(): Promise<StampedTreatmentPeriod[]> {
      return (await visibleRows()).map(toStampedPeriod)
    },

    listByTreatment(treatmentId: string): Promise<TreatmentPeriodRecord[]> {
      return listVisible('AND treatment_id = ?', [treatmentId])
    },

    listByAnimal(animalId: string): Promise<TreatmentPeriodRecord[]> {
      return listVisible('AND animal_id = ?', [animalId])
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
        period.referenceOn,
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
      ]
      const devices = [period.createdByDevice, period.updatedByDevice]
      return exists
        ? {
            sql: `UPDATE treatment_period
                  SET starts_on = ?, first_due_on = ?, reference_on = ?, ends_on = ?,
                      stopped_on = ?, frequency_value = ?, frequency_unit = ?, times = ?,
                      dose_quantity = ?, dose_unit = ?, reminder_offset_minutes = ?,
                      reminder_time = ?, created_at = ?, updated_at = ?, deleted_at = NULL,
                      created_by_device = ?, updated_by_device = ?
                  WHERE id = ?`,
            params: [...values, ...devices, period.id],
          }
        : {
            sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
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
