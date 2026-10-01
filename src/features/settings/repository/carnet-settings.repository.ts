import type { DbClient } from '@/core/db/db-client'
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
}

/**
 * Pas de ligne tant que rien n'est réglé : une ligne par défaut, plus récente, écraserait à la
 * première synchronisation les réglages faits sur un autre appareil.
 */
export function createCarnetSettingsRepository(db: DbClient) {
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
