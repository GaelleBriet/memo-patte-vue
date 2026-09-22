import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import {
  vaccinationInputSchema,
  vaccinationUpdateSchema,
  type Vaccination,
  type VaccinationInput,
  type VaccinationUpdateInput,
} from '../schema/vaccination.schema'

interface VaccinationRow {
  id: string
  animal_id: string
  name: string
  last_injection_date: string
  due_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type VaccinationVersion = Pick<Vaccination, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
export type RestoredVaccination = Omit<Vaccination, 'deletedAt'>

const COLUMNS =
  'id, animal_id, name, last_injection_date, due_date, created_at, updated_at, deleted_at'

/** Les vaccins supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

function toVaccination(row: VaccinationRow): Vaccination {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    lastInjectionDate: row.last_injection_date,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export interface VaccinationsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

export function createVaccinationsRepository(
  db: DbClient,
  { loadSupabaseClient: loadClient = loadSupabaseClient }: VaccinationsRepositoryDependencies = {},
) {
  async function getById(id: string): Promise<Vaccination | null> {
    const rows = await db.query<VaccinationRow>(
      `SELECT ${COLUMNS} FROM vaccination WHERE id = ? AND ${NOT_DELETED}`,
      [id],
    )
    const row = rows[0]
    return row ? toVaccination(row) : null
  }

  return {
    entity: 'vaccination',

    getById,

    async listByAnimal(animalId: string): Promise<Vaccination[]> {
      const rows = await db.query<VaccinationRow>(
        `SELECT ${COLUMNS} FROM vaccination
         WHERE animal_id = ? AND ${NOT_DELETED}
         ORDER BY last_injection_date DESC, name COLLATE NOCASE`,
        [animalId],
      )
      return rows.map(toVaccination)
    },

    async listAll(): Promise<Vaccination[]> {
      const rows = await db.query<VaccinationRow>(
        `SELECT ${COLUMNS} FROM vaccination
         WHERE ${NOT_DELETED}
         ORDER BY animal_id, last_injection_date DESC, name COLLATE NOCASE`,
      )
      return rows.map(toVaccination)
    },

    async create(input: VaccinationInput): Promise<Vaccination> {
      const data = vaccinationInputSchema.parse(input)
      const now = new Date().toISOString()
      const vaccination: Vaccination = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.run(`INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        vaccination.id,
        vaccination.animalId,
        vaccination.name,
        vaccination.lastInjectionDate,
        vaccination.dueDate,
        vaccination.createdAt,
        vaccination.updatedAt,
        vaccination.deletedAt,
      ])

      return vaccination
    },

    /** `animal_id` reste hors du `SET` : le rattachement est figé à la création. */
    async update(id: string, input: VaccinationUpdateInput): Promise<Vaccination> {
      const data = vaccinationUpdateSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE vaccination
         SET name = ?, last_injection_date = ?, due_date = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [data.name, data.lastInjectionDate, data.dueDate, updatedAt, id],
      )

      if (changes === 0) {
        throw new Error(`Vaccin introuvable : ${id}`)
      }

      const vaccination = await getById(id)
      if (!vaccination) {
        throw new Error(`Vaccin introuvable : ${id}`)
      }
      return vaccination
    },

    /** Sans effet sur un vaccin inconnu ou déjà supprimé : la date initiale est gardée. */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.run(
        `UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
        [deletedAt, deletedAt, id],
      )
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<VaccinationVersion[]> {
      const rows = await db.query<VaccinationRow>(`SELECT ${COLUMNS} FROM vaccination`)
      return rows.map(({ id, animal_id, updated_at, deleted_at }) => ({
        id,
        animalId: animal_id,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt],
      }
    },

    /** Reprend les dates du fichier importé et rend la ligne visible, sans la changer d'animal. */
    restoreStatement(vaccination: RestoredVaccination, exists: boolean): SqlStatement {
      const { id, animalId, name, lastInjectionDate, dueDate, createdAt, updatedAt } = vaccination
      return exists
        ? {
            sql: `UPDATE vaccination
                  SET name = ?, last_injection_date = ?, due_date = ?,
                      created_at = ?, updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [name, lastInjectionDate, dueDate, createdAt, updatedAt, id],
          }
        : {
            sql: `INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
            params: [id, animalId, name, lastInjectionDate, dueDate, createdAt, updatedAt],
          }
    },

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<VaccinationRow>(
        `SELECT ${COLUMNS} FROM vaccination WHERE id = ?`,
        [id],
      )
      return (rows[0] as SyncRow | undefined) ?? null
    },

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'vaccination', ['user_id', 'id'], { ...row, user_id: userId })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('vaccination')
        .select(`${COLUMNS}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as Array<VaccinationRow & { server_updated_at: string }>
      const cursor = rows.length > 0 ? (rows.at(-1)?.server_updated_at ?? null) : null
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...columns }) => columns as SyncRow),
        cursor,
      }
    },

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO vaccination (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                animal_id = excluded.animal_id, name = excluded.name,
                last_injection_date = excluded.last_injection_date, due_date = excluded.due_date,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > vaccination.updated_at`,
        params: [
          row.id,
          syncField(row, 'animal_id'),
          syncField(row, 'name'),
          syncField(row, 'last_injection_date'),
          syncField(row, 'due_date'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
        ],
      }
    },
  }
}

export type VaccinationsRepository = ReturnType<typeof createVaccinationsRepository>

let repository: Promise<VaccinationsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getVaccinationsRepository(): Promise<VaccinationsRepository> {
  repository ??= getDb()
    .then(createVaccinationsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
