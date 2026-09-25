import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import {
  createVaccinationInjectionsRepository,
  headInjectionIdSql,
} from './vaccination-injections.repository'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
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
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface VaccinationWithHeadRow extends VaccinationRow {
  last_injection_date: string
  due_date: string | null
}

export type VaccinationVersion = Pick<Vaccination, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
export type RestoredVaccination = Pick<
  Vaccination,
  'id' | 'animalId' | 'name' | 'createdAt' | 'updatedAt'
>

const COLUMNS = 'id, animal_id, name, created_at, updated_at, deleted_at'

/** Les vaccins supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

const VISIBLE_WITH_HEAD = `
  SELECT vaccination.id, vaccination.animal_id, vaccination.name,
         head.injected_on AS last_injection_date, head.next_due_date AS due_date,
         vaccination.created_at, vaccination.updated_at, vaccination.deleted_at
  FROM vaccination
  JOIN vaccination_injection head ON head.id = ${headInjectionIdSql('vaccination.id')}
  WHERE vaccination.deleted_at IS NULL`

function toVaccination(row: VaccinationWithHeadRow): Vaccination {
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
  const injections = createVaccinationInjectionsRepository(db)

  async function getById(id: string): Promise<Vaccination | null> {
    const rows = await db.query<VaccinationWithHeadRow>(
      `${VISIBLE_WITH_HEAD} AND vaccination.id = ?`,
      [id],
    )
    const row = rows[0]
    return row ? toVaccination(row) : null
  }

  async function requireVisible(id: string): Promise<Vaccination> {
    const vaccination = await getById(id)
    if (!vaccination) {
      throw new Error(`Vaccin introuvable : ${id}`)
    }
    return vaccination
  }

  return {
    entity: 'vaccination',

    getById,

    async listByAnimal(animalId: string): Promise<Vaccination[]> {
      const rows = await db.query<VaccinationWithHeadRow>(
        `${VISIBLE_WITH_HEAD} AND vaccination.animal_id = ?
         ORDER BY head.injected_on DESC, vaccination.name COLLATE NOCASE`,
        [animalId],
      )
      return rows.map(toVaccination)
    },

    async listAll(): Promise<Vaccination[]> {
      const rows = await db.query<VaccinationWithHeadRow>(
        `${VISIBLE_WITH_HEAD}
         ORDER BY vaccination.animal_id, head.injected_on DESC, vaccination.name COLLATE NOCASE`,
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

      await db.runMany([
        {
          sql: `INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, NULL)`,
          params: [vaccination.id, vaccination.animalId, vaccination.name, now, now],
        },
        injections.insertStatement({
          id: vaccination.id,
          vaccinationId: vaccination.id,
          animalId: vaccination.animalId,
          injectedOn: vaccination.lastInjectionDate,
          nextDueDate: vaccination.dueDate,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
      ])

      return vaccination
    },

    /** Change le vaccin et son injection de tête ; `animal_id` reste figé depuis la création. */
    async update(id: string, input: VaccinationUpdateInput): Promise<Vaccination> {
      const data = vaccinationUpdateSchema.parse(input)
      await requireVisible(id)
      const updatedAt = new Date().toISOString()

      await db.runMany([
        {
          sql: `UPDATE vaccination SET name = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
          params: [data.name, updatedAt, id],
        },
        injections.updateHeadStatement(id, {
          injectedOn: data.lastInjectionDate,
          nextDueDate: data.dueDate,
          updatedAt,
        }),
      ])

      return requireVisible(id)
    },

    listInjections(vaccinationId: string): Promise<VaccinationInjection[]> {
      return injections.listByVaccination(vaccinationId)
    },

    /** Sans effet sur un vaccin inconnu ou déjà supprimé : la date initiale est gardée. */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, id],
        },
        injections.markDeletedByVaccinationStatement(id, deletedAt),
      ])
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
      const { id, animalId, name, createdAt, updatedAt } = vaccination
      return exists
        ? {
            sql: `UPDATE vaccination
                  SET name = ?, created_at = ?, updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [name, createdAt, updatedAt, id],
          }
        : {
            sql: `INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, NULL)`,
            params: [id, animalId, name, createdAt, updatedAt],
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
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                animal_id = excluded.animal_id, name = excluded.name,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > vaccination.updated_at`,
        params: [
          row.id,
          syncField(row, 'animal_id'),
          syncField(row, 'name'),
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
