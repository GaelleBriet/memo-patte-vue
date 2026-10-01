import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import {
  carnetSettingsSchema,
  DEFAULT_CARNET_SETTINGS,
  type CarnetSettings,
} from '../schema/carnet-settings.schema'

/** Le même sur tous les appareils : deux appareils Plus écrivent la même ligne. */
export const CARNET_SETTINGS_ID = '00000000-0000-0000-0000-000000000000'

interface CarnetSettingsRow {
  vaccine_reminder_time: string
  remind_before_due: number
}

const SYNC_COLUMN_NAMES = [
  'id',
  'vaccine_reminder_time',
  'remind_before_due',
  'created_at',
  'updated_at',
  'deleted_at',
]
const SYNC_COLUMNS = SYNC_COLUMN_NAMES.join(', ')

export interface CarnetSettingsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

/**
 * Pas de ligne tant que rien n'est réglé : une ligne par défaut, plus récente, écraserait à la
 * première synchronisation les réglages faits sur un autre appareil.
 */
export function createCarnetSettingsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
  }: CarnetSettingsRepositoryDependencies = {},
) {
  async function get(): Promise<CarnetSettings> {
    const [row] = await db.query<CarnetSettingsRow>(
      `SELECT vaccine_reminder_time, remind_before_due FROM carnet_settings
       WHERE id = ? AND deleted_at IS NULL`,
      [CARNET_SETTINGS_ID],
    )
    if (!row) return { ...DEFAULT_CARNET_SETTINGS }
    return {
      vaccineReminderTime: row.vaccine_reminder_time,
      remindBeforeDue: row.remind_before_due === 1,
    }
  }

  return {
    entity: 'carnet_settings',

    get,

    async update(changes: Partial<CarnetSettings>): Promise<CarnetSettings> {
      const settings = carnetSettingsSchema.parse({ ...(await get()), ...changes })
      const now = new Date().toISOString()

      await db.run(
        `INSERT INTO carnet_settings
           (id, vaccine_reminder_time, remind_before_due, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT (id) DO UPDATE SET
           vaccine_reminder_time = excluded.vaccine_reminder_time,
           remind_before_due = excluded.remind_before_due,
           updated_at = excluded.updated_at, deleted_at = NULL`,
        [
          CARNET_SETTINGS_ID,
          settings.vaccineReminderTime,
          settings.remindBeforeDue ? 1 : 0,
          now,
          now,
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

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'carnet_settings', ['user_id', 'id'], {
        ...row,
        user_id: userId,
      })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('carnet_settings')
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
