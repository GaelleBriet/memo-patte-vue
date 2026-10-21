import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createPushedRowReplacement } from '@/core/sync/repository/pushed-row-replacement'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import { createTreatmentDosesRepository } from './treatment-doses.repository'
import { createTreatmentPeriodsRepository } from './treatment-periods.repository'
import { createTreatmentPlanWrites } from './treatment-plan-writes.repository'
import { createTreatmentReads } from './treatment-reads.repository'
import type { Treatment } from '../schema/treatment.schema'
import {
  COLUMNS,
  NOT_DELETED,
  type StampedTreatmentRecord,
  type TreatmentRow,
} from './treatment-row.repository'

export type { StampedTreatmentRecord } from './treatment-row.repository'
export type TreatmentVersion = Pick<Treatment, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
export type RestoredTreatment = StampedTreatmentRecord

export interface TreatmentsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

export function createTreatmentsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: TreatmentsRepositoryDependencies = {},
) {
  const periods = createTreatmentPeriodsRepository(db, { deviceId })
  const doses = createTreatmentDosesRepository(db, { deviceId })

  const reads = createTreatmentReads(db, periods, doses)

  return {
    entity: 'treatment',

    ...reads,
    ...createTreatmentPlanWrites(db, deviceId, { periods, doses, getById: reads.getById }),

    /**
     * Rend l'instant de la suppression, à passer à `restore`. Sans effet sur un traitement inconnu
     * ou déjà supprimé : la date initiale est gardée.
     */
    async remove(id: string): Promise<string> {
      const deletedAt = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        periods.markDeletedByTreatmentStatement(id, deletedAt),
        doses.markDeletedByTreatmentStatement(id, deletedAt),
      ])
      return deletedAt
    },

    /** Rétablit le traitement, ses périodes et ses prises supprimés à cet instant, et eux seuls. */
    async restore(id: string, deletedAt: string): Promise<void> {
      const at = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE treatment SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND deleted_at = ?`,
          params: [at, deviceId(), id, deletedAt],
        },
        periods.reviveByTreatmentStatement(id, deletedAt, at),
        doses.reviveByTreatmentStatement(id, deletedAt, at),
      ])
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
      }
    },

    /** Les lignes supprimées à cet instant, avec leur animal. */
    reviveByAnimalStatement(animalId: string, deletedAt: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), animalId, deletedAt],
      }
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<TreatmentVersion[]> {
      const rows = await db.query<TreatmentRow>(`SELECT ${COLUMNS} FROM treatment`)
      return rows.map(({ id, animal_id, updated_at, deleted_at }) => ({
        id,
        animalId: animal_id,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM treatment' }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    /** Rend la ligne visible sans la changer d'animal. */
    restoreStatement(treatment: RestoredTreatment, exists: boolean): SqlStatement {
      const values = [
        treatment.name,
        treatment.type,
        treatment.createdAt,
        treatment.updatedAt,
        treatment.createdByDevice,
        treatment.updatedByDevice,
      ]
      return exists
        ? {
            sql: `UPDATE treatment
                  SET name = ?, type = ?, created_at = ?, updated_at = ?, created_by_device = ?,
                      updated_by_device = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [...values, treatment.id],
          }
        : {
            sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at,
                    created_by_device, updated_by_device)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [treatment.id, treatment.animalId, ...values],
          }
    },

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<TreatmentRow>(`SELECT ${COLUMNS} FROM treatment WHERE id = ?`, [
        id,
      ])
      return (rows[0] as SyncRow | undefined) ?? null
    },

    ...createRemoteSyncTable({ table: 'treatment', columns: COLUMNS, loadClient }),
    ...createPushedRowReplacement({ table: 'treatment', columns: COLUMNS }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                animal_id = excluded.animal_id, name = excluded.name, type = excluded.type,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at, created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
              WHERE excluded.updated_at > treatment.updated_at`,
        params: [
          row.id,
          syncField(row, 'animal_id'),
          syncField(row, 'name'),
          syncField(row, 'type'),
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

export type TreatmentsRepository = ReturnType<typeof createTreatmentsRepository>
export type TreatmentWithPeriodsReader = Pick<TreatmentsRepository, 'getWithPeriods'>
export type AllTreatmentsWithPeriodsReader = Pick<TreatmentsRepository, 'listAllWithPeriods'>
export type TreatmentRemover = Pick<TreatmentsRepository, 'remove' | 'restore'>

let repository: Promise<TreatmentsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentsRepository(): Promise<TreatmentsRepository> {
  repository ??= getDb()
    .then(createTreatmentsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
