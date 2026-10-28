import type { DbClient, SqlStatement } from '@/core/db/db-client'
import {
  ANIMAL_PHOTO_ENTITY,
  LIVE_ANIMAL_PHOTOS_FROM,
  REFUSED_FOR_ITSELF,
  REFUSED_WITH_ANCESTOR,
  SYNC_PARENT_COLUMNS,
} from '@/core/db/schema-statements'
import { SYNC_ENTITY_ORDER } from './sync-entity-order'

export interface SyncOutboxEntry {
  entity: string
  entityId: string
  queuedAt: string
  attempts: number
}

interface SyncOutboxRow {
  entity: string
  entity_id: string
  queued_at: string
  attempts: number
}

function queueWholeTable(entity: string): SqlStatement {
  return {
    sql: `INSERT OR IGNORE INTO sync_outbox (entity, entity_id, queued_at)
          SELECT ?, id, updated_at FROM ${entity}`,
    params: [entity],
  }
}

const LIVE_ANIMALS = 'SELECT id FROM animal WHERE deleted_at IS NULL'

function queueLiveTable(entity: string): SqlStatement {
  const source =
    entity === 'device'
      ? ''
      : entity === 'carnet_settings'
        ? `WHERE EXISTS (${LIVE_ANIMALS})`
        : entity === 'animal'
          ? 'WHERE deleted_at IS NULL'
          : `WHERE deleted_at IS NULL AND animal_id IN (${LIVE_ANIMALS})`
  return {
    sql: `INSERT OR IGNORE INTO sync_outbox (entity, entity_id, queued_at)
          SELECT ?, id, updated_at FROM ${entity} ${source}`,
    params: [entity],
  }
}

/** Heure de mise en file, pas date de l'animal : le délai avant d'effacer une photo du cloud en part. */
function queueLiveAnimalPhotos(): SqlStatement {
  return {
    sql: `INSERT OR IGNORE INTO sync_outbox (entity, entity_id, queued_at)
          SELECT ?, photo_path, ? ${LIVE_ANIMAL_PHOTOS_FROM}`,
    params: [ANIMAL_PHOTO_ENTITY, new Date().toISOString()],
  }
}

const NOT_REFUSED = 'refused_at IS NULL'

/** Hors effacement d'une photo sortie du carnet, qui ne sauvegarde rien. */
const SAVES_CARNET = `(entity <> ? OR entity_id IN (SELECT photo_path ${LIVE_ANIMAL_PHOTOS_FROM}))`

const RETRY_REFUSED: SqlStatement = {
  sql: 'UPDATE sync_outbox SET refused_at = NULL, refused_reason = NULL',
}

const ENTITY_RANK = `CASE entity ${SYNC_ENTITY_ORDER.map((_, rank) => `WHEN ? THEN ${rank}`).join(' ')}
  ELSE ${SYNC_ENTITY_ORDER.length} END`

function toEntry(row: SyncOutboxRow): SyncOutboxEntry {
  return {
    entity: row.entity,
    entityId: row.entity_id,
    queuedAt: row.queued_at,
    attempts: row.attempts,
  }
}

export function createSyncOutboxRepository(db: DbClient) {
  return {
    /**
     * Lignes supprimées comprises, photos des seuls animaux non supprimés ; une entrée déjà en file
     * garde son `queued_at` et ses essais, une entrée refusée est retentée.
     */
    queueWholeCarnetStatements(): SqlStatement[] {
      return [RETRY_REFUSED, ...SYNC_ENTITY_ORDER.map(queueWholeTable), queueLiveAnimalPhotos()]
    },

    /**
     * Premier envoi vers un compte vide : la fiche de l'appareil, puis seulement ce qui est visible
     * (animaux non supprimés, leurs lignes non supprimées, leurs photos) ; sans animal visible,
     * rien d'autre que l'appareil. Les suppressions n'ont rien à effacer sur un compte vide.
     */
    queueLiveCarnetStatements(): SqlStatement[] {
      return [RETRY_REFUSED, ...SYNC_ENTITY_ORDER.map(queueLiveTable), queueLiveAnimalPhotos()]
    },

    /** Les photos déjà en file y restent : celles à effacer du cloud ne doivent pas y rester orphelines. */
    keepPhotosAndQueueDevicesStatements(): SqlStatement[] {
      return [
        RETRY_REFUSED,
        { sql: 'DELETE FROM sync_outbox WHERE entity <> ?', params: [ANIMAL_PHOTO_ENTITY] },
        queueWholeTable('device'),
      ]
    },

    clearStatement(): SqlStatement {
      return { sql: 'DELETE FROM sync_outbox' }
    },

    /** Ce que `queueWholeCarnetStatements` met en file : chaque ligne du carnet et chaque photo. */
    async countWholeCarnet(): Promise<number> {
      const counts = [
        ...SYNC_ENTITY_ORDER.map((entity) => `SELECT COUNT(*) FROM ${entity}`),
        `SELECT COUNT(DISTINCT photo_path) ${LIVE_ANIMAL_PHOTOS_FROM}`,
      ]
      const [row] = await db.query<{ total: number }>(
        `SELECT ${counts.map((count) => `(${count})`).join(' + ')} AS total`,
      )
      return row?.total ?? 0
    },

    async countPending(): Promise<number> {
      const [row] = await db.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM sync_outbox WHERE ${NOT_REFUSED} AND ${SAVES_CARNET}`,
        [ANIMAL_PHOTO_ENTITY],
      )
      return row?.total ?? 0
    },

    /** Les éléments du carnet que le serveur refuse pour toujours, photos comprises. */
    async countRefused(): Promise<number> {
      const [row] = await db.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM sync_outbox
         WHERE refused_at IS NOT NULL AND ${SAVES_CARNET}`,
        [ANIMAL_PHOTO_ENTITY],
      )
      return row?.total ?? 0
    },

    async countRefusedPhotos(): Promise<number> {
      const [row] = await db.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM sync_outbox
         WHERE refused_at IS NOT NULL AND entity = ?
           AND entity_id IN (SELECT photo_path ${LIVE_ANIMAL_PHOTOS_FROM})`,
        [ANIMAL_PHOTO_ENTITY],
      )
      return row?.total ?? 0
    },

    /** Dans l'ordre de `SYNC_ENTITY_ORDER`, puis de mise en file ; sans les entrées refusées. */
    async listPending(): Promise<SyncOutboxEntry[]> {
      const rows = await db.query<SyncOutboxRow>(
        `SELECT entity, entity_id, queued_at, attempts FROM sync_outbox WHERE ${NOT_REFUSED}
         ORDER BY ${ENTITY_RANK}, queued_at`,
        SYNC_ENTITY_ORDER,
      )
      return rows.map(toEntry)
    },

    /** Ne retire l'entrée que si `queuedAt` n'a pas bougé depuis la lecture (§3.3 de la proposition). */
    async removeIfUnchanged(
      entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>,
    ): Promise<void> {
      await db.run('DELETE FROM sync_outbox WHERE entity = ? AND entity_id = ? AND queued_at = ?', [
        entry.entity,
        entry.entityId,
        entry.queuedAt,
      ])
    },

    /**
     * En une requête : un ancêtre remis en file entre une lecture et l'écriture démarquerait ses
     * descendants avant que l'entrée soit marquée. Rend vrai si l'entrée est marquée.
     */
    async markRefusedWithRefusedAncestor(
      entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>,
      refusedAt: string,
    ): Promise<boolean> {
      const parents = Object.entries(SYNC_PARENT_COLUMNS[entry.entity] ?? {})
      if (parents.length === 0) return false
      const marked = await db.run(
        `UPDATE sync_outbox SET refused_at = ?, refused_reason = ?
         WHERE entity = ? AND entity_id = ? AND queued_at = ?
           AND EXISTS (SELECT 1 FROM ${entry.entity} child JOIN sync_outbox parent
             ON parent.refused_at IS NOT NULL
            AND (${parents
              .map(
                ([column, parent]) =>
                  `(parent.entity = '${parent}' AND parent.entity_id = child.${column})`,
              )
              .join(' OR ')})
           WHERE child.id = ?)`,
        [
          refusedAt,
          REFUSED_WITH_ANCESTOR,
          entry.entity,
          entry.entityId,
          entry.queuedAt,
          entry.entityId,
        ],
      )
      return marked > 0
    },

    /** Même garde que `removeIfUnchanged` : une modification arrivée depuis la lecture repart en file. */
    async markRefusedIfUnchanged(
      entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>,
      refusedAt: string,
    ): Promise<void> {
      await db.run(
        `UPDATE sync_outbox SET refused_at = ?, refused_reason = ?
         WHERE entity = ? AND entity_id = ? AND queued_at = ?`,
        [refusedAt, REFUSED_FOR_ITSELF, entry.entity, entry.entityId, entry.queuedAt],
      )
    },

    async recordFailedPush(entry: Pick<SyncOutboxEntry, 'entity' | 'entityId'>): Promise<void> {
      await db.run(
        'UPDATE sync_outbox SET attempts = attempts + 1 WHERE entity = ? AND entity_id = ?',
        [entry.entity, entry.entityId],
      )
    },

    async clear(): Promise<void> {
      await db.run('DELETE FROM sync_outbox')
    },
  }
}

export type SyncOutboxRepository = ReturnType<typeof createSyncOutboxRepository>
