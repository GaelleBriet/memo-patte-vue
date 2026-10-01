import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import { addFrequency } from '../logic/treatment-frequency'
import { createTreatmentDosesRepository, headDoseIdSql } from './treatment-doses.repository'
import {
  createTreatmentPeriodsRepository,
  currentPeriodIdSql,
} from './treatment-periods.repository'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import {
  treatmentEditSchemaAfter,
  treatmentInputSchema,
  type FrequencyUnit,
  type Treatment,
  type TreatmentInput,
  type TreatmentEditInput,
  type TreatmentType,
} from '../schema/treatment.schema'

interface TreatmentRow {
  id: string
  animal_id: string
  name: string
  type: TreatmentType
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface TreatmentWithHeadRow extends TreatmentRow {
  period_id: string
  frequency_value: number
  frequency_unit: FrequencyUnit
  stopped_on: string | null
  last_dose_date: string
  next_due_date: string
}

export type TreatmentVersion = Pick<Treatment, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
export type RestoredTreatment = Pick<
  Treatment,
  'id' | 'animalId' | 'name' | 'type' | 'createdAt' | 'updatedAt'
>

const COLUMNS = 'id, animal_id, name, type, created_at, updated_at, deleted_at'

/** Les traitements supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

/**
 * La dernière ligne est datée de son échéance tant qu'elle n'a pas été donnée ; le traitement, de
 * la modification la plus récente entre lui et sa période en cours.
 */
const VISIBLE_WITH_HEAD = `
  SELECT treatment.id, treatment.animal_id, treatment.name, treatment.type,
         period.id AS period_id, period.frequency_value, period.frequency_unit, period.stopped_on,
         COALESCE(head.given_on, head.due_on) AS last_dose_date, head.next_due_date,
         treatment.created_at, MAX(treatment.updated_at, period.updated_at) AS updated_at,
         treatment.deleted_at
  FROM treatment
  JOIN treatment_period period ON period.id = ${currentPeriodIdSql('treatment.id')}
  JOIN treatment_dose head ON head.id = ${headDoseIdSql('treatment.id')}
  WHERE treatment.deleted_at IS NULL`

function toTreatment(row: TreatmentWithHeadRow): Treatment {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    type: row.type,
    periodId: row.period_id,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    lastDoseDate: row.last_dose_date,
    nextDueDate: row.next_due_date,
    stoppedOn: row.stopped_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export interface TreatmentsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

export function createTreatmentsRepository(
  db: DbClient,
  { loadSupabaseClient: loadClient = loadSupabaseClient }: TreatmentsRepositoryDependencies = {},
) {
  const periods = createTreatmentPeriodsRepository(db)
  const doses = createTreatmentDosesRepository(db)

  async function getById(id: string): Promise<Treatment | null> {
    const rows = await db.query<TreatmentWithHeadRow>(`${VISIBLE_WITH_HEAD} AND treatment.id = ?`, [
      id,
    ])
    const row = rows[0]
    return row ? toTreatment(row) : null
  }

  async function requireVisible(id: string): Promise<Treatment> {
    const treatment = await getById(id)
    if (!treatment) {
      throw new Error(`Traitement introuvable : ${id}`)
    }
    return treatment
  }

  async function writePlan(
    id: string,
    input: TreatmentEditInput,
    { resume }: { resume: boolean },
  ): Promise<Treatment> {
    const current = await requireVisible(id)
    const data = treatmentEditSchemaAfter(current.lastDoseDate).parse(input)
    const updatedAt = new Date().toISOString()

    await db.runMany([
      {
        sql: `UPDATE treatment SET name = ?, type = ?, updated_at = ?
              WHERE id = ? AND ${NOT_DELETED}`,
        params: [data.name, data.type, updatedAt, id],
      },
      periods.correctCurrentStatement(id, { frequency: data.frequency, resume, updatedAt }),
      doses.updateHeadStatement(id, { nextDueDate: data.nextDueDate, updatedAt }),
    ])

    return requireVisible(id)
  }

  return {
    entity: 'treatment',

    getById,

    /** Le plus urgent d'abord : l'ordre de la section « Traitements en cours » et de l'accueil. */
    async listByAnimal(animalId: string): Promise<Treatment[]> {
      const rows = await db.query<TreatmentWithHeadRow>(
        `${VISIBLE_WITH_HEAD} AND treatment.animal_id = ?
         ORDER BY head.next_due_date, treatment.created_at`,
        [animalId],
      )
      return rows.map(toTreatment)
    },

    async listAll(): Promise<Treatment[]> {
      const rows = await db.query<TreatmentWithHeadRow>(
        `${VISIBLE_WITH_HEAD}
         ORDER BY treatment.animal_id, head.next_due_date, treatment.created_at`,
      )
      return rows.map(toTreatment)
    },

    /**
     * Le traitement, sa première période et sa première prise, donnée le jour de la dernière prise,
     * en une seule écriture ; période et prise portent l'identifiant du traitement.
     */
    async create(input: TreatmentInput): Promise<Treatment> {
      const data = treatmentInputSchema.parse(input)
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const stamps = { createdAt: now, updatedAt: now, deletedAt: null }
      const treatment: Treatment = {
        ...data,
        id,
        periodId: id,
        nextDueDate: addFrequency(data.lastDoseDate, data.frequency),
        stoppedOn: null,
        ...stamps,
      }

      await db.runMany([
        {
          sql: `INSERT INTO treatment (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          params: [id, data.animalId, data.name, data.type, now, now],
        },
        periods.insertStatement({
          id,
          treatmentId: id,
          animalId: data.animalId,
          startsOn: data.lastDoseDate,
          firstDueOn: data.lastDoseDate,
          frequency: data.frequency,
          stoppedOn: null,
          ...stamps,
        }),
        doses.insertStatement({
          id,
          periodId: id,
          treatmentId: id,
          animalId: data.animalId,
          dueOn: data.lastDoseDate,
          dueTime: null,
          givenOn: data.lastDoseDate,
          status: 'given',
          nextDueDate: treatment.nextDueDate,
          ...stamps,
        }),
      ])

      return treatment
    },

    /**
     * Corrige le nom, le type, la fréquence de la période en cours et la prochaine dose de la
     * dernière ligne, dans une seule écriture ; la date de la prise et `animal_id` restent figés.
     */
    update(id: string, input: TreatmentEditInput): Promise<Treatment> {
      return writePlan(id, input, { resume: false })
    },

    /** Comme `update`, et la période en cours repart : son historique reste le sien. */
    resume(id: string, input: TreatmentEditInput): Promise<Treatment> {
      return writePlan(id, input, { resume: true })
    },

    listDoses(treatmentId: string): Promise<TreatmentDose[]> {
      return doses.listByTreatment(treatmentId)
    },

    countDosesByAnimal(animalId: string): Promise<Record<string, number>> {
      return doses.countByAnimal(animalId)
    },

    /** Sans effet sur un traitement inconnu ou déjà supprimé : la date initiale est gardée. */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE treatment SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, id],
        },
        periods.markDeletedByTreatmentStatement(id, deletedAt),
        doses.markDeletedByTreatmentStatement(id, deletedAt),
      ])
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },

    /** Lignes supprimées comprises, datées comme à la lecture : l'import compare les versions. */
    async listVersions(): Promise<TreatmentVersion[]> {
      const rows = await db.query<
        Pick<TreatmentRow, 'id' | 'animal_id' | 'updated_at' | 'deleted_at'>
      >(
        `SELECT treatment.id, treatment.animal_id, treatment.deleted_at,
                MAX(treatment.updated_at, COALESCE(period.updated_at, treatment.updated_at))
                  AS updated_at
         FROM treatment
         LEFT JOIN treatment_period period ON period.id = ${currentPeriodIdSql('treatment.id')}`,
      )
      return rows.map(({ id, animal_id, updated_at, deleted_at }) => ({
        id,
        animalId: animal_id,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ? WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt],
      }
    },

    /** Rend la ligne visible sans la changer d'animal. */
    restoreStatement(treatment: RestoredTreatment, exists: boolean): SqlStatement {
      const values = [treatment.name, treatment.type, treatment.createdAt, treatment.updatedAt]
      return exists
        ? {
            sql: `UPDATE treatment
                  SET name = ?, type = ?, created_at = ?, updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [...values, treatment.id],
          }
        : {
            sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
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

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'treatment', ['user_id', 'id'], { ...row, user_id: userId })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('treatment')
        .select(`${COLUMNS}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as Array<TreatmentRow & { server_updated_at: string }>
      const cursor = rows.length > 0 ? (rows.at(-1)?.server_updated_at ?? null) : null
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...columns }) => columns as SyncRow),
        cursor,
      }
    },

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                animal_id = excluded.animal_id, name = excluded.name, type = excluded.type,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > treatment.updated_at`,
        params: [
          row.id,
          syncField(row, 'animal_id'),
          syncField(row, 'name'),
          syncField(row, 'type'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
        ],
      }
    },
  }
}

export type TreatmentsRepository = ReturnType<typeof createTreatmentsRepository>

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
