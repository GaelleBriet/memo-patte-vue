import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import {
  weightEntryInputSchema,
  weightEntryUpdateSchema,
  type WeightEntry,
  type WeightEntryInput,
  type WeightEntryUpdateInput,
} from '../schema/weight.schema'

interface WeightEntryRow {
  id: string
  animal_id: string
  weight_kg: number
  measured_on: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type WeightEntryVersion = Pick<WeightEntry, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
export type RestoredWeightEntry = Omit<WeightEntry, 'deletedAt'>

const COLUMNS = 'id, animal_id, weight_kg, measured_on, created_at, updated_at, deleted_at'

/** Les pesées supprimées restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

function toWeightEntry(row: WeightEntryRow): WeightEntry {
  return {
    id: row.id,
    animalId: row.animal_id,
    weightKg: row.weight_kg,
    measuredOn: row.measured_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export interface WeightRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

export function createWeightRepository(
  db: DbClient,
  { loadSupabaseClient: loadClient = loadSupabaseClient }: WeightRepositoryDependencies = {},
) {
  async function getById(id: string): Promise<WeightEntry | null> {
    const rows = await db.query<WeightEntryRow>(
      `SELECT ${COLUMNS} FROM weight_entry WHERE id = ? AND ${NOT_DELETED}`,
      [id],
    )
    const row = rows[0]
    return row ? toWeightEntry(row) : null
  }

  return {
    entity: 'weight_entry',

    getById,

    /** Ordre chronologique croissant : celui de la courbe, la liste inversée se fait à l'affichage. */
    async listByAnimal(animalId: string): Promise<WeightEntry[]> {
      const rows = await db.query<WeightEntryRow>(
        `SELECT ${COLUMNS} FROM weight_entry
         WHERE animal_id = ? AND ${NOT_DELETED}
         ORDER BY measured_on, created_at`,
        [animalId],
      )
      return rows.map(toWeightEntry)
    },

    async create(input: WeightEntryInput): Promise<WeightEntry> {
      const data = weightEntryInputSchema.parse(input)
      const now = new Date().toISOString()
      const entry: WeightEntry = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.run(`INSERT INTO weight_entry (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        entry.id,
        entry.animalId,
        entry.weightKg,
        entry.measuredOn,
        entry.createdAt,
        entry.updatedAt,
        entry.deletedAt,
      ])

      return entry
    },

    /** `animal_id` reste hors du `SET` : le rattachement est figé à la création. */
    async update(id: string, input: WeightEntryUpdateInput): Promise<WeightEntry> {
      const data = weightEntryUpdateSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE weight_entry
         SET weight_kg = ?, measured_on = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [data.weightKg, data.measuredOn, updatedAt, id],
      )

      if (changes === 0) {
        throw new Error(`Pesée introuvable : ${id}`)
      }

      const entry = await getById(id)
      if (!entry) {
        throw new Error(`Pesée introuvable : ${id}`)
      }
      return entry
    },

    /** Sans effet sur une pesée inconnue ou déjà supprimée : la date initiale est gardée. */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.run(
        `UPDATE weight_entry SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
        [deletedAt, deletedAt, id],
      )
    },

    /** Sans effet sur une pesée visible, inconnue, ou dont l'animal a été supprimé. */
    async undoRemove(id: string): Promise<void> {
      await db.run(
        `UPDATE weight_entry SET deleted_at = NULL, updated_at = ?
         WHERE id = ? AND deleted_at IS NOT NULL
           AND animal_id IN (SELECT id FROM animal WHERE deleted_at IS NULL)`,
        [new Date().toISOString(), id],
      )
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE weight_entry SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<WeightEntryVersion[]> {
      const rows = await db.query<WeightEntryRow>(`SELECT ${COLUMNS} FROM weight_entry`)
      return rows.map(({ id, animal_id, updated_at, deleted_at }) => ({
        id,
        animalId: animal_id,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE weight_entry SET deleted_at = ?, updated_at = ? WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt],
      }
    },

    /** Reprend les dates du fichier importé et rend la ligne visible, sans la changer d'animal. */
    restoreStatement(entry: RestoredWeightEntry, exists: boolean): SqlStatement {
      const { id, animalId, weightKg, measuredOn, createdAt, updatedAt } = entry
      return exists
        ? {
            sql: `UPDATE weight_entry
                  SET weight_kg = ?, measured_on = ?, created_at = ?, updated_at = ?,
                      deleted_at = NULL
                  WHERE id = ?`,
            params: [weightKg, measuredOn, createdAt, updatedAt, id],
          }
        : {
            sql: `INSERT INTO weight_entry (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
            params: [id, animalId, weightKg, measuredOn, createdAt, updatedAt],
          }
    },

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<WeightEntryRow>(
        `SELECT ${COLUMNS} FROM weight_entry WHERE id = ?`,
        [id],
      )
      return (rows[0] as SyncRow | undefined) ?? null
    },

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'weight_entry', ['user_id', 'id'], { ...row, user_id: userId })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('weight_entry')
        .select(`${COLUMNS}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as Array<WeightEntryRow & { server_updated_at: string }>
      const cursor = rows.length > 0 ? (rows.at(-1)?.server_updated_at ?? null) : null
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...columns }) => columns as SyncRow),
        cursor,
      }
    },

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO weight_entry (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                animal_id = excluded.animal_id, weight_kg = excluded.weight_kg,
                measured_on = excluded.measured_on, created_at = excluded.created_at,
                updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > weight_entry.updated_at`,
        params: [
          row.id,
          syncField(row, 'animal_id'),
          syncField(row, 'weight_kg'),
          syncField(row, 'measured_on'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
        ],
      }
    },
  }
}

export type WeightRepository = ReturnType<typeof createWeightRepository>

let repository: Promise<WeightRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getWeightRepository(): Promise<WeightRepository> {
  repository ??= getDb()
    .then(createWeightRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
