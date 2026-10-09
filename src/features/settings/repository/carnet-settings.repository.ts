import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import {
  carnetSettingsSchema,
  DEFAULT_CARNET_SETTINGS,
  type CarnetSettings,
} from '../schema/carnet-settings.schema'
import type { DeviceStamps } from '@/shared/domain/carnet-data'

/** Le même sur tous les appareils : deux appareils Plus écrivent la même ligne. */
export const CARNET_SETTINGS_ID = '00000000-0000-0000-0000-000000000000'

interface CarnetSettingsRow {
  vaccine_reminder_time: string
  remind_before_due: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

/** Les réglages tels que leur ligne les enregistre : ce que l'export emporte et que l'import écrit. */
export type CarnetSettingsRecord = CarnetSettings & {
  createdAt: string
  updatedAt: string
} & DeviceStamps
export type CarnetSettingsVersion = { updatedAt: string; deletedAt: string | null }

const SYNC_COLUMN_NAMES = [
  'id',
  'vaccine_reminder_time',
  'remind_before_due',
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by_device',
  'updated_by_device',
]
const SYNC_COLUMNS = SYNC_COLUMN_NAMES.join(', ')

export interface CarnetSettingsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

/**
 * Pas de ligne tant que rien n'est réglé : une ligne par défaut, plus récente, écraserait à la
 * première synchronisation les réglages faits sur un autre appareil.
 */
export function createCarnetSettingsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: CarnetSettingsRepositoryDependencies = {},
) {
  async function row(): Promise<CarnetSettingsRow | undefined> {
    const [found] = await db.query<CarnetSettingsRow>(
      `SELECT ${SYNC_COLUMNS} FROM carnet_settings WHERE id = ?`,
      [CARNET_SETTINGS_ID],
    )
    return found
  }

  /** `null` tant que rien n'est réglé, ou après un import qui a remis les réglages par défaut. */
  async function getRecord(): Promise<CarnetSettingsRecord | null> {
    const found = await row()
    if (!found || found.deleted_at !== null) return null
    return {
      vaccineReminderTime: found.vaccine_reminder_time,
      remindBeforeDue: found.remind_before_due === 1,
      createdAt: found.created_at,
      updatedAt: found.updated_at,
      createdByDevice: found.created_by_device,
      updatedByDevice: found.updated_by_device,
    }
  }

  async function get(): Promise<CarnetSettings> {
    const record = await getRecord()
    if (!record) return { ...DEFAULT_CARNET_SETTINGS }
    return {
      vaccineReminderTime: record.vaccineReminderTime,
      remindBeforeDue: record.remindBeforeDue,
    }
  }

  return {
    entity: 'carnet_settings',

    get,

    getRecord,

    /** Ligne supprimée comprise : l'import compare les versions avant d'écrire. */
    async getVersion(): Promise<CarnetSettingsVersion | null> {
      const found = await row()
      return found ? { updatedAt: found.updated_at, deletedAt: found.deleted_at } : null
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM carnet_settings' }
    },

    markDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE carnet_settings SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE id = ? AND deleted_at IS NULL`,
        params: [deletedAt, deletedAt, deviceId(), CARNET_SETTINGS_ID],
      }
    },

    /** Reprend les réglages et les dates du fichier importé, et rend la ligne visible. */
    restoreStatement(settings: CarnetSettingsRecord): SqlStatement {
      return {
        sql: `INSERT INTO carnet_settings (${SYNC_COLUMNS})
              VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                vaccine_reminder_time = excluded.vaccine_reminder_time,
                remind_before_due = excluded.remind_before_due,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = NULL, created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device`,
        params: [
          CARNET_SETTINGS_ID,
          settings.vaccineReminderTime,
          settings.remindBeforeDue ? 1 : 0,
          settings.createdAt,
          settings.updatedAt,
          settings.createdByDevice,
          settings.updatedByDevice,
        ],
      }
    },

    async update(changes: Partial<CarnetSettings>): Promise<CarnetSettings> {
      const settings = carnetSettingsSchema.parse({ ...(await get()), ...changes })
      const now = new Date().toISOString()
      const device = deviceId()

      await db.run(
        `INSERT INTO carnet_settings (${SYNC_COLUMNS})
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           vaccine_reminder_time = excluded.vaccine_reminder_time,
           remind_before_due = excluded.remind_before_due,
           updated_at = excluded.updated_at, deleted_at = NULL,
           updated_by_device = excluded.updated_by_device`,
        [
          CARNET_SETTINGS_ID,
          settings.vaccineReminderTime,
          settings.remindBeforeDue ? 1 : 0,
          now,
          now,
          device,
          device,
        ],
      )

      return settings
    },

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<SyncRow>(
        `SELECT ${SYNC_COLUMNS} FROM carnet_settings WHERE id = ?`,
        [id],
      )
      return rows[0] ?? null
    },

    ...createRemoteSyncTable({ table: 'carnet_settings', columns: SYNC_COLUMNS, loadClient }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO carnet_settings (${SYNC_COLUMNS})
              VALUES (${SYNC_COLUMN_NAMES.map(() => '?').join(', ')})
              ON CONFLICT (id) DO UPDATE SET
                ${SYNC_COLUMN_NAMES.slice(1)
                  .map((column) => `${column} = excluded.${column}`)
                  .join(', ')}
              WHERE excluded.updated_at > carnet_settings.updated_at`,
        params: SYNC_COLUMN_NAMES.map((column) => syncField(row, column)),
      }
    },
  }
}

export type CarnetSettingsRepository = ReturnType<typeof createCarnetSettingsRepository>

let repository: Promise<CarnetSettingsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getCarnetSettingsRepository(): Promise<CarnetSettingsRepository> {
  repository ??= getDb()
    .then(createCarnetSettingsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
