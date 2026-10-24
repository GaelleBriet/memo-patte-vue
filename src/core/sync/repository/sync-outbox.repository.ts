import type { DbClient, SqlStatement } from '@/core/db/db-client'
import {
  ANIMAL_PHOTO_ENTITY,
  LIVE_ANIMAL_PHOTOS_FROM,
  SYNC_PARENT_COLUMNS,
} from '@/core/db/schema-statements'
import { getDb } from '@/core/db/sqlite'

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

interface SyncStateRow {
  enabled: number
  restoring: number
  last_synced_at: string | null
}

/** Chaque parent avant ses enfants : l'ordre des clés étrangères Postgres, au push comme au pull. */
export const SYNC_ENTITY_ORDER = [
  'device',
  'animal',
  'vaccination',
  'vaccination_injection',
  'treatment',
  'treatment_period',
  'treatment_dose',
  'weight_entry',
  'carnet_settings',
]

export type RestoreMode = 'merge' | 'replace'

const RESTORE_CODES: Record<RestoreMode, number> = { merge: 1, replace: 2 }
const RESTORE_MODES: Record<number, RestoreMode> = { 1: 'merge', 2: 'replace' }

function queueWholeTable(entity: string): SqlStatement {
  return {
    sql: `INSERT OR IGNORE INTO sync_outbox (entity, entity_id, queued_at)
          SELECT ?, id, updated_at FROM ${entity}`,
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

const RETRY_REFUSED: SqlStatement = { sql: 'UPDATE sync_outbox SET refused_at = NULL' }

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
  async function state(): Promise<SyncStateRow> {
    const [row] = await db.query<SyncStateRow>(
      'SELECT enabled, restoring, last_synced_at FROM sync_state WHERE id = 1',
    )
    if (!row) throw new Error('sync_state introuvable : la migration v9 a-t-elle été jouée ?')
    return row
  }

  return {
    async isEnabled(): Promise<boolean> {
      return (await state()).enabled === 1
    },

    async setEnabled(enabled: boolean): Promise<void> {
      await db.run('UPDATE sync_state SET enabled = ? WHERE id = 1', [enabled ? 1 : 0])
    },

    /**
     * Lignes supprimées comprises, photos des seuls animaux non supprimés ; une entrée déjà en file
     * garde son `queued_at` et ses essais, une entrée refusée est retentée.
     * Le pull suivant repart du début : il ramène tout le carnet du compte.
     */
    async enableAndQueueWholeCarnet(): Promise<void> {
      await db.runMany([
        { sql: 'UPDATE sync_state SET enabled = 1, last_synced_at = NULL WHERE id = 1' },
        { sql: 'DELETE FROM sync_pull_cursor' },
        RETRY_REFUSED,
        ...SYNC_ENTITY_ORDER.map(queueWholeTable),
        queueLiveAnimalPhotos(),
      ])
    },

    /** Ce que `enableAndQueueWholeCarnet` met en file : chaque ligne du carnet et chaque photo. */
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

    async getLastPulledAt(entity: string): Promise<string | null> {
      const [row] = await db.query<{ last_pulled_at: string }>(
        'SELECT last_pulled_at FROM sync_pull_cursor WHERE entity = ?',
        [entity],
      )
      return row?.last_pulled_at ?? null
    },

    async setLastPulledAt(entity: string, lastPulledAt: string): Promise<void> {
      await db.run(
        `INSERT INTO sync_pull_cursor (entity, last_pulled_at) VALUES (?, ?)
         ON CONFLICT (entity) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
        [entity, lastPulledAt],
      )
    },

    /** Le prochain pull repart du début pour chaque table ; les données locales ne bougent pas. */
    async clearPullCursors(): Promise<void> {
      await db.run('DELETE FROM sync_pull_cursor')
    },

    async getLastSyncedAt(): Promise<string | null> {
      return (await state()).last_synced_at
    },

    async setLastSyncedAt(lastSyncedAt: string): Promise<void> {
      await db.run('UPDATE sync_state SET last_synced_at = ? WHERE id = 1', [lastSyncedAt])
    },

    /** Le choix fait à la restauration, gardé jusqu'à ce que le carnet du compte soit écrit. */
    async restoreMode(): Promise<RestoreMode | null> {
      return RESTORE_MODES[(await state()).restoring] ?? null
    },

    async startRestore(mode: RestoreMode): Promise<void> {
      await db.run('UPDATE sync_state SET restoring = ? WHERE id = 1', [RESTORE_CODES[mode]])
    },

    /**
     * Autour du carnet tiré : synchro coupée pendant l'écriture, curseurs posés au bout de ce qui
     * a été tiré, synchro activée à la fin. Avant l'écriture, « Fusionner » met en file tout le
     * carnet du téléphone et ses photos, « Remplacer » seulement ses appareils, et garde les photos
     * déjà en file : celles à effacer du cloud ne doivent pas y rester orphelines.
     */
    restoreStatements({
      mode,
      cursors,
    }: {
      mode: RestoreMode
      cursors: ReadonlyArray<{ entity: string; lastPulledAt: string }>
    }): { before: SqlStatement[]; after: SqlStatement[] } {
      return {
        before: [
          { sql: 'UPDATE sync_state SET enabled = 0, last_synced_at = NULL WHERE id = 1' },
          { sql: 'DELETE FROM sync_pull_cursor' },
          RETRY_REFUSED,
          ...(mode === 'merge'
            ? [...SYNC_ENTITY_ORDER.map(queueWholeTable), queueLiveAnimalPhotos()]
            : [
                { sql: 'DELETE FROM sync_outbox WHERE entity <> ?', params: [ANIMAL_PHOTO_ENTITY] },
                queueWholeTable('device'),
              ]),
        ],
        after: [
          ...cursors.map(({ entity, lastPulledAt }) => ({
            sql: 'INSERT INTO sync_pull_cursor (entity, last_pulled_at) VALUES (?, ?)',
            params: [entity, lastPulledAt],
          })),
          { sql: 'UPDATE sync_state SET enabled = 1, restoring = 0 WHERE id = 1' },
        ],
      }
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
        `UPDATE sync_outbox SET refused_at = ?
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
        [refusedAt, entry.entity, entry.entityId, entry.queuedAt, entry.entityId],
      )
      return marked > 0
    },

    /** Même garde que `removeIfUnchanged` : une modification arrivée depuis la lecture repart en file. */
    async markRefusedIfUnchanged(
      entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>,
      refusedAt: string,
    ): Promise<void> {
      await db.run(
        `UPDATE sync_outbox SET refused_at = ?
         WHERE entity = ? AND entity_id = ? AND queued_at = ?`,
        [refusedAt, entry.entity, entry.entityId, entry.queuedAt],
      )
    },

    /**
     * Déconnexion (§5 de la proposition) : le compte suivant ne reçoit ni la file, ni les curseurs,
     * ni la dernière sauvegarde du précédent.
     */
    async forgetAccount(): Promise<void> {
      await db.runMany([
        {
          sql: `UPDATE sync_state SET enabled = 0, restoring = 0, last_synced_at = NULL
                WHERE id = 1`,
        },
        { sql: 'DELETE FROM sync_outbox' },
        { sql: 'DELETE FROM sync_pull_cursor' },
      ])
    },

    /** Une photo retirée garde son fichier le temps d'« Annuler » : sa présence seule ne suffit pas. */
    async isPhotoInCarnet(fileName: string): Promise<boolean> {
      const rows = await db.query(
        `SELECT 1 ${LIVE_ANIMAL_PHOTOS_FROM} AND photo_path = ? LIMIT 1`,
        [fileName],
      )
      return rows.length > 0
    },

    async isPhotoKeptByAnimal(fileName: string): Promise<boolean> {
      const rows = await db.query('SELECT 1 FROM animal WHERE photo_path = ? LIMIT 1', [fileName])
      return rows.length > 0
    },

    async listCarnetPhotos(): Promise<string[]> {
      const rows = await db.query<{ photo_path: string }>(
        `SELECT DISTINCT photo_path ${LIVE_ANIMAL_PHOTOS_FROM}`,
      )
      return rows.map(({ photo_path }) => photo_path)
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

    /** `sync_state` garde sa ligne unique, remise à son état de premier lancement. */
    eraseAllStatements(): SqlStatement[] {
      return [
        { sql: 'DELETE FROM sync_outbox' },
        { sql: 'DELETE FROM sync_pull_cursor' },
        {
          sql: `UPDATE sync_state SET enabled = 0, restoring = 0, last_synced_at = NULL
                WHERE id = 1`,
        },
      ]
    },
  }
}

export type SyncOutboxRepository = ReturnType<typeof createSyncOutboxRepository>

let repository: Promise<SyncOutboxRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getSyncOutboxRepository(): Promise<SyncOutboxRepository> {
  repository ??= getDb()
    .then(createSyncOutboxRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
