import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
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
import type { DeviceStamps } from '@/shared/domain/carnet-data'

interface VaccinationRow {
  id: string
  animal_id: string
  name: string
  planned_due_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

interface VaccinationWithHeadRow extends Omit<
  VaccinationRow,
  'planned_due_date' | 'created_by_device' | 'updated_by_device'
> {
  last_injection_date: string | null
  due_date: string | null
}

export type VaccinationVersion = Pick<Vaccination, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
/** Le vaccin tel que sa table l'enregistre, sans la tête de son historique. */
export type VaccinationRecord = Pick<
  Vaccination,
  'id' | 'animalId' | 'name' | 'createdAt' | 'updatedAt'
> & { plannedDueDate: string | null } & DeviceStamps
export type RestoredVaccination = VaccinationRecord

const COLUMNS =
  'id, animal_id, name, planned_due_date, created_at, updated_at, deleted_at, created_by_device, ' +
  'updated_by_device'

/** Les vaccins supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

/** Sans injection, le prochain rappel est le rappel prévu ; avec, celui de la dernière injection. */
const VISIBLE_WITH_HEAD = `
  SELECT vaccination.id, vaccination.animal_id, vaccination.name,
         head.injected_on AS last_injection_date,
         CASE WHEN head.id IS NULL THEN vaccination.planned_due_date ELSE head.next_due_date END
           AS due_date,
         vaccination.created_at, vaccination.updated_at, vaccination.deleted_at
  FROM vaccination
  LEFT JOIN vaccination_injection head ON head.id = ${headInjectionIdSql('vaccination.id')}
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
  deviceId?: () => string
}

export function createVaccinationsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: VaccinationsRepositoryDependencies = {},
) {
  const injections = createVaccinationInjectionsRepository(db, { deviceId })

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

    /** Vaccins visibles, rappel prévu compris, qu'ils aient ou non une injection. */
    async listRecords(): Promise<VaccinationRecord[]> {
      const rows = await db.query<VaccinationRow>(
        `SELECT ${COLUMNS} FROM vaccination WHERE ${NOT_DELETED}
         ORDER BY animal_id, created_at, id`,
      )
      return rows.map((row) => ({
        id: row.id,
        animalId: row.animal_id,
        name: row.name,
        plannedDueDate: row.planned_due_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdByDevice: row.created_by_device,
        updatedByDevice: row.updated_by_device,
      }))
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

      const insertVaccination: SqlStatement = {
        sql: `INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        params: [
          vaccination.id,
          vaccination.animalId,
          vaccination.name,
          data.lastInjectionDate === null ? data.dueDate : null,
          now,
          now,
          deviceId(),
          deviceId(),
        ],
      }

      await db.runMany(
        data.lastInjectionDate === null
          ? [insertVaccination]
          : [
              insertVaccination,
              injections.insertStatement({
                id: vaccination.id,
                vaccinationId: vaccination.id,
                animalId: vaccination.animalId,
                injectedOn: data.lastInjectionDate,
                nextDueDate: data.dueDate,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
              }),
            ],
      )

      return vaccination
    },

    /**
     * Change le nom et le prochain rappel : celui de la dernière injection, ou le rendez-vous prévu
     * d'un vaccin sans injection, qui ne peut pas rester sans rappel.
     */
    async update(id: string, input: VaccinationUpdateInput): Promise<Vaccination> {
      const data = vaccinationUpdateSchema.parse(input)
      const current = await requireVisible(id)
      const isPlanned = current.lastInjectionDate === null
      if (isPlanned && data.dueDate === null) {
        throw new Error(`Prochain rappel obligatoire sans injection : ${id}`)
      }
      const updatedAt = new Date().toISOString()

      await db.runMany(
        isPlanned
          ? [
              {
                sql: `UPDATE vaccination
                      SET name = ?, planned_due_date = ?, updated_at = ?, updated_by_device = ?
                      WHERE id = ? AND ${NOT_DELETED}`,
                params: [data.name, data.dueDate, updatedAt, deviceId(), id],
              },
            ]
          : [
              {
                sql: `UPDATE vaccination SET name = ?, updated_at = ?, updated_by_device = ?
                      WHERE id = ? AND ${NOT_DELETED}`,
                params: [data.name, updatedAt, deviceId(), id],
              },
              injections.updateHeadDueStatement(id, { nextDueDate: data.dueDate, updatedAt }),
            ],
      )

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
          sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        injections.markDeletedByVaccinationStatement(id, deletedAt),
      ])
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
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
        sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    /** Reprend les dates du fichier importé et rend la ligne visible, sans la changer d'animal. */
    restoreStatement(vaccination: RestoredVaccination, exists: boolean): SqlStatement {
      const { id, animalId, name, plannedDueDate, createdAt, updatedAt } = vaccination
      const devices = [vaccination.createdByDevice, vaccination.updatedByDevice]
      return exists
        ? {
            sql: `UPDATE vaccination
                  SET name = ?, planned_due_date = ?, created_at = ?, updated_at = ?,
                      deleted_at = NULL, created_by_device = ?, updated_by_device = ?
                  WHERE id = ?`,
            params: [name, plannedDueDate, createdAt, updatedAt, ...devices, id],
          }
        : {
            sql: `INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            params: [id, animalId, name, plannedDueDate, createdAt, updatedAt, ...devices],
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
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                animal_id = excluded.animal_id, name = excluded.name,
                planned_due_date = excluded.planned_due_date,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at, created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
              WHERE excluded.updated_at > vaccination.updated_at`,
        params: [
          row.id,
          syncField(row, 'animal_id'),
          syncField(row, 'name'),
          syncField(row, 'planned_due_date'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
          syncField(row, 'created_by_device'),
          syncField(row, 'updated_by_device'),
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
