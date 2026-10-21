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
import { createTreatmentReads } from './treatment-reads.repository'
import { treatmentFirstPeriodSettingsSchema } from '../schema/treatment-period.schema'
import {
  treatmentNameSchema,
  treatmentTypeSchema,
  type Treatment,
} from '../schema/treatment.schema'
import type {
  NewTreatmentPlan,
  PlannedDoseWrite,
  TreatmentPlanWrite,
} from '../schema/treatment-plan.schema'
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

  async function requireVisible(id: string): Promise<Treatment> {
    const treatment = await reads.getById(id)
    if (!treatment) {
      throw new Error(`Traitement introuvable : ${id}`)
    }
    return treatment
  }

  function identityOf({ name, type }: Pick<Treatment, 'name' | 'type'>) {
    return {
      name: treatmentNameSchema.parse(name),
      type: treatmentTypeSchema.parse(type),
    }
  }

  function doseStatement(
    write: PlannedDoseWrite,
    { id: treatmentId, animalId }: Treatment,
    at: string,
  ): SqlStatement {
    switch (write.action) {
      case 'create':
        return doses.createStatement({ id: write.id, treatmentId, animalId, dose: write.dose, at })
      case 'rewrite':
        return doses.rewriteStatement(write.id, write.dose, at)
      case 'delete':
        return doses.markDeletedStatement([write.id], at)
    }
  }

  return {
    entity: 'treatment',

    ...reads,

    /** Le traitement, sa première période, de même identifiant, et les prises du plan : tout ou rien. */
    async create(plan: NewTreatmentPlan): Promise<Treatment> {
      const { name, type } = identityOf(plan)
      treatmentFirstPeriodSettingsSchema.parse(plan.settings)
      const now = new Date().toISOString()

      await db.runMany([
        {
          sql: `INSERT INTO treatment (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          params: [plan.id, plan.animalId, name, type, now, now, deviceId(), deviceId()],
        },
        periods.insertStatement({
          ...plan.settings,
          gridOriginOn: plan.settings.firstDueOn,
          firstDueChosen: true,
          fallenDosesAnswer: 'unasked',
          id: plan.id,
          treatmentId: plan.id,
          animalId: plan.animalId,
          stoppedOn: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
        ...(plan.doses ?? []).map(({ id, dose }) =>
          doses.createStatement({
            id,
            treatmentId: plan.id,
            animalId: plan.animalId,
            dose,
            at: now,
          }),
        ),
      ])

      return requireVisible(plan.id)
    },

    /**
     * Nom et type, réglages de la période en cours ou nouvelle période, lignes de déplacement :
     * tout ou rien. Une ligne que rien ne change n'est pas datée ; `animal_id` reste figé.
     */
    async applyPlan(id: string, plan: TreatmentPlanWrite): Promise<Treatment> {
      const current = await requireVisible(id)
      const at = new Date().toISOString()
      const statements: SqlStatement[] = []

      if (plan.treatment !== null) {
        const { name, type } = identityOf(plan.treatment)
        statements.push({
          sql: `UPDATE treatment SET name = ?, type = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED} AND (name <> ? OR type <> ?)`,
          params: [name, type, at, deviceId(), id, name, type],
        })
      }
      if (plan.period?.action === 'correct') {
        const { id: periodId, settings, judgedGrid, ...origin } = plan.period
        statements.push(
          periods.correctSettingsStatement(periodId, settings, at, origin, judgedGrid),
        )
      }
      if (plan.period?.action === 'open') {
        statements.push(
          periods.insertStatement({
            ...plan.period.settings,
            gridOriginOn: plan.period.gridOriginOn,
            firstDueChosen: plan.period.firstDueChosen,
            fallenDosesAnswer: plan.period.fallenDosesAnswer,
            id: plan.period.id,
            treatmentId: id,
            animalId: current.animalId,
            stoppedOn: null,
            createdAt: at,
            updatedAt: at,
            gridWrittenAt: plan.period.judgedGrid ?? at,
            gridBefore: plan.period.gridBefore ?? null,
            deletedAt: null,
          }),
        )
      }
      statements.push(...plan.doses.map((write) => doseStatement(write, current, at)))

      if (statements.length > 0) await db.runMany(statements)
      return requireVisible(id)
    },

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
