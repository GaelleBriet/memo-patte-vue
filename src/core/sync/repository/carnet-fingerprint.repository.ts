import type { DbClient } from '@/core/db/db-client'
import { SYNC_ENTITY_ORDER } from './sync-entity-order'

const CARNET_ENTITIES = SYNC_ENTITY_ORDER.filter((entity) => entity !== 'device')

const FINGERPRINT_SQL = `SELECT ${CARNET_ENTITIES.map(
  (entity) =>
    `(SELECT '${entity}:' || COUNT(*) || ':' || IFNULL(MAX(updated_at), '') FROM ${entity})`,
).join(` || '|' || `)} AS fingerprint`

export function createCarnetFingerprintRepository(db: DbClient) {
  return {
    /** Change dès qu'une ligne du carnet est ajoutée, modifiée ou supprimée, appareils exclus. */
    async read(): Promise<string> {
      const [row] = await db.query<{ fingerprint: string }>(FINGERPRINT_SQL)
      return row?.fingerprint ?? ''
    },
  }
}
