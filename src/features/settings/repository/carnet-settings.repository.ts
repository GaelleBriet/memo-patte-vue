import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
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
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Les réglages tels que leur ligne les enregistre : ce que l'export emporte et que l'import écrit. */
export type CarnetSettingsRecord = CarnetSettings & { createdAt: string; updatedAt: string }
export type CarnetSettingsVersion = { updatedAt: string; deletedAt: string | null }

const COLUMNS = 'vaccine_reminder_time, remind_before_due, created_at, updated_at, deleted_at'

/**
 * Pas de ligne tant que rien n'est réglé : une ligne par défaut, plus récente, écraserait à la
 * première synchronisation les réglages faits sur un autre appareil.
 */
export function createCarnetSettingsRepository(db: DbClient) {
  async function row(): Promise<CarnetSettingsRow | undefined> {
    const [found] = await db.query<CarnetSettingsRow>(
      `SELECT ${COLUMNS} FROM carnet_settings WHERE id = ?`,
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

    markDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE carnet_settings SET deleted_at = ?, updated_at = ?
              WHERE id = ? AND deleted_at IS NULL`,
        params: [deletedAt, deletedAt, CARNET_SETTINGS_ID],
      }
    },

    /** Reprend les réglages et les dates du fichier importé, et rend la ligne visible. */
    restoreStatement(settings: CarnetSettingsRecord): SqlStatement {
      return {
        sql: `INSERT INTO carnet_settings (id, ${COLUMNS})
              VALUES (?, ?, ?, ?, ?, NULL)
              ON CONFLICT (id) DO UPDATE SET
                vaccine_reminder_time = excluded.vaccine_reminder_time,
                remind_before_due = excluded.remind_before_due,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = NULL`,
        params: [
          CARNET_SETTINGS_ID,
          settings.vaccineReminderTime,
          settings.remindBeforeDue ? 1 : 0,
          settings.createdAt,
          settings.updatedAt,
        ],
      }
    },

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
