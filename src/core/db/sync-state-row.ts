import type { DbClient } from './db-client'

/** Une base de développement a pu perdre la ligne : sans elle, sauvegarde et restauration lèvent. */
export async function repairSyncStateRow(db: DbClient): Promise<void> {
  await db.run('INSERT OR IGNORE INTO sync_state (id) VALUES (1)')
}
