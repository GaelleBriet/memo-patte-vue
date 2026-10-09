import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import type { DeviceIdentity } from './device-identity'

export type DeviceRecord = {
  id: string
  model: string | null
  installedAt: string
  createdAt: string
  updatedAt: string
}

export type DeviceVersion = { id: string; updatedAt: string; deletedAt: string | null }

interface DeviceRow {
  id: string
  model: string | null
  installed_at: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const COLUMN_NAMES = ['id', 'model', 'installed_at', 'created_at', 'updated_at', 'deleted_at']
const COLUMNS = COLUMN_NAMES.join(', ')
const PLACEHOLDERS = COLUMN_NAMES.map(() => '?').join(', ')

export const MAX_MODEL_LENGTH = 200

function toRecord(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    model: row.model,
    installedAt: row.installed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface DeviceRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

export function createDeviceRepository(
  db: DbClient,
  { loadSupabaseClient: loadClient = loadSupabaseClient }: DeviceRepositoryDependencies = {},
) {
  return {
    entity: 'device',

    /** Sans effet sur un appareil déjà enregistré : sa date d'installation ne bouge pas. */
    async register({ id, installedAt }: DeviceIdentity, model: string | null): Promise<void> {
      const now = new Date().toISOString()
      await db.run(
        `INSERT INTO device (${COLUMNS}) VALUES (${PLACEHOLDERS}) ON CONFLICT (id) DO NOTHING`,
        [id, model?.slice(0, MAX_MODEL_LENGTH) ?? null, installedAt, now, now, null],
      )
    },

    async listRecords(): Promise<DeviceRecord[]> {
      const rows = await db.query<DeviceRow>(
        `SELECT ${COLUMNS} FROM device WHERE deleted_at IS NULL ORDER BY installed_at, id`,
      )
      return rows.map(toRecord)
    },

    async listVersions(): Promise<DeviceVersion[]> {
      const rows = await db.query<DeviceRow>(`SELECT ${COLUMNS} FROM device`)
      return rows.map(({ id, updated_at, deleted_at }) => ({
        id,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    restoreStatement(device: DeviceRecord, exists: boolean): SqlStatement {
      const values = [device.model, device.installedAt, device.createdAt, device.updatedAt]
      return exists
        ? {
            sql: `UPDATE device
                  SET model = ?, installed_at = ?, created_at = ?, updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [...values, device.id],
          }
        : {
            sql: `INSERT INTO device (${COLUMNS}) VALUES (${PLACEHOLDERS})`,
            params: [device.id, ...values, null],
          }
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM device' }
    },

    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<SyncRow>(`SELECT ${COLUMNS} FROM device WHERE id = ?`, [id])
      return rows[0] ?? null
    },

    ...createRemoteSyncTable({ table: 'device', columns: COLUMNS, loadClient }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO device (${COLUMNS})
              VALUES (${PLACEHOLDERS})
              ON CONFLICT (id) DO UPDATE SET
                ${COLUMN_NAMES.slice(1)
                  .map((column) => `${column} = excluded.${column}`)
                  .join(', ')}
              WHERE excluded.updated_at > device.updated_at`,
        params: COLUMN_NAMES.map((column) => syncField(row, column)),
      }
    },
  }
}

export type DeviceRepository = ReturnType<typeof createDeviceRepository>

let repository: Promise<DeviceRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getDeviceRepository(): Promise<DeviceRepository> {
  repository ??= getDb()
    .then(createDeviceRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
