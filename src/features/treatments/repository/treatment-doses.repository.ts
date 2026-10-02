import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlParam, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import { currentPeriodIdSql } from './treatment-periods.repository'
import type { NewTreatmentDose, TreatmentDose } from '../schema/treatment-dose.schema'
import type { FrequencyUnit } from '../schema/treatment.schema'
import type { DoseFields } from '@/shared/domain/treatment-schedule'

export type RestoredTreatmentDose = Omit<NewTreatmentDose, 'deletedAt'>
export type TreatmentDoseVersion = Pick<
  NewTreatmentDose,
  'id' | 'periodId' | 'treatmentId' | 'updatedAt' | 'deletedAt'
>

type DoseOwner = Pick<NewTreatmentDose, 'id' | 'treatmentId' | 'animalId'>

/** Une écriture du moteur d'échéances ; `restore` ne sert qu'à défaire un `delete`. */
export type DoseWrite =
  | ({ action: 'create'; dose: DoseFields } & DoseOwner)
  | { action: 'rewrite'; id: string; dose: DoseFields }
  | { action: 'delete'; id: string }
  | { action: 'restore'; id: string }

interface DoseRow {
  id: string
  period_id: string
  treatment_id: string
  animal_id: string
  due_on: string
  due_time: string | null
  given_on: string | null
  status: TreatmentDose['status']
  next_due_date: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface DoseWithFrequencyRow extends DoseRow {
  frequency_value: number
  frequency_unit: FrequencyUnit
}

type DoseVersionRow = Pick<
  DoseRow,
  'id' | 'period_id' | 'treatment_id' | 'updated_at' | 'deleted_at'
>

const COLUMNS =
  'id, period_id, treatment_id, animal_id, due_on, due_time, given_on, status, next_due_date, created_at, updated_at, deleted_at'

const COLUMN_NAMES = COLUMNS.split(', ')
const PLACEHOLDERS = COLUMN_NAMES.map(() => '?').join(', ')

const NOT_DELETED = 'deleted_at IS NULL'

/** Une prise lue porte la fréquence de sa période : elle n'est jamais recopiée. */
const WITH_FREQUENCY = `
  SELECT ${COLUMN_NAMES.map((column) => `dose.${column}`).join(', ')},
         period.frequency_value, period.frequency_unit
  FROM treatment_dose dose
  JOIN treatment_period period ON period.id = dose.period_id`

const HEAD_FIRST = 'dose.due_on DESC, dose.due_time DESC, dose.created_at DESC, dose.id DESC'

function toDose(row: DoseWithFrequencyRow): TreatmentDose {
  return {
    id: row.id,
    periodId: row.period_id,
    treatmentId: row.treatment_id,
    animalId: row.animal_id,
    dueOn: row.due_on,
    dueTime: row.due_time,
    givenOn: row.given_on,
    status: row.status,
    nextDueDate: row.next_due_date,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

function lastOfPeriodSql(column: string, periodId: string, filter = ''): string {
  return `(SELECT candidate.${column} FROM treatment_dose candidate
           WHERE candidate.period_id = ${periodId} AND candidate.deleted_at IS NULL ${filter}
           ORDER BY candidate.due_on DESC, candidate.due_time DESC, candidate.created_at DESC,
             candidate.id DESC
           LIMIT 1)`
}

/**
 * Sous-requête de la dernière ligne d'une période (`periodId` est une expression SQL) : la prise
 * non supprimée à l'échéance la plus tardive, jour puis heure, puis par saisie, puis par identifiant.
 */
export function headDoseIdSql(periodId: string): string {
  return lastOfPeriodSql('id', periodId)
}

/** Sous-requête de la date de la dernière prise donnée d'une période, dans l'ordre de `headDoseIdSql`. */
export function lastGivenOnSql(periodId: string): string {
  return lastOfPeriodSql('given_on', periodId, "AND candidate.status = 'given'")
}

function valuesOf(dose: NewTreatmentDose): SqlParam[] {
  return [
    dose.id,
    dose.periodId,
    dose.treatmentId,
    dose.animalId,
    dose.dueOn,
    dose.dueTime,
    dose.givenOn,
    dose.status,
    dose.nextDueDate,
    dose.createdAt,
    dose.updatedAt,
    dose.deletedAt,
  ]
}

function fieldsOf(row: DoseRow): DoseFields {
  return {
    periodId: row.period_id,
    dueOn: row.due_on,
    dueTime: row.due_time,
    givenOn: row.given_on,
    status: row.status,
    nextDueDate: row.next_due_date,
  }
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}

export interface TreatmentDosesRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

export function createTreatmentDosesRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
  }: TreatmentDosesRepositoryDependencies = {},
) {
  function insertStatement(dose: NewTreatmentDose): SqlStatement {
    return {
      sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (${PLACEHOLDERS})`,
      params: valuesOf(dose),
    }
  }

  function createStatement({
    dose,
    at,
    ...owner
  }: DoseOwner & { dose: DoseFields; at: string }): SqlStatement {
    return insertStatement({ ...owner, ...dose, createdAt: at, updatedAt: at, deletedAt: null })
  }

  function rewriteStatement(id: string, dose: DoseFields, updatedAt: string): SqlStatement {
    return {
      sql: `UPDATE treatment_dose
            SET period_id = ?, due_on = ?, due_time = ?, given_on = ?, status = ?,
                next_due_date = ?, updated_at = ?
            WHERE id = ? AND ${NOT_DELETED}`,
      params: [
        dose.periodId,
        dose.dueOn,
        dose.dueTime,
        dose.givenOn,
        dose.status,
        dose.nextDueDate,
        updatedAt,
        id,
      ],
    }
  }

  function markDeletedStatement(ids: readonly string[], deletedAt: string): SqlStatement {
    return {
      sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ?
            WHERE id IN (${placeholders(ids)}) AND ${NOT_DELETED}`,
      params: [deletedAt, deletedAt, ...ids],
    }
  }

  function reviveStatement(id: string, updatedAt: string): SqlStatement {
    return {
      sql: 'UPDATE treatment_dose SET deleted_at = NULL, updated_at = ? WHERE id = ?',
      params: [updatedAt, id],
    }
  }

  async function rowsById(ids: readonly string[]): Promise<Map<string, DoseRow>> {
    if (ids.length === 0) return new Map()
    const rows = await db.query<DoseRow>(
      `SELECT ${COLUMNS} FROM treatment_dose WHERE id IN (${placeholders(ids)})`,
      [...ids],
    )
    return new Map(rows.map((row) => [row.id, row]))
  }

  return {
    entity: 'treatment_dose',

    /** Prises visibles, la dernière ligne d'abord. */
    async listByTreatment(treatmentId: string): Promise<TreatmentDose[]> {
      const rows = await db.query<DoseWithFrequencyRow>(
        `${WITH_FREQUENCY}
         WHERE dose.treatment_id = ? AND dose.deleted_at IS NULL
         ORDER BY ${HEAD_FIRST}`,
        [treatmentId],
      )
      return rows.map(toDose)
    },

    /** Prises visibles de tous les traitements, celles d'un même traitement la dernière d'abord. */
    async listAll(): Promise<TreatmentDose[]> {
      const rows = await db.query<DoseWithFrequencyRow>(
        `${WITH_FREQUENCY}
         WHERE dose.deleted_at IS NULL
         ORDER BY dose.treatment_id, ${HEAD_FIRST}`,
      )
      return rows.map(toDose)
    },

    /** Prises visibles des traitements d'un animal, celles d'un même traitement la dernière d'abord. */
    async listByAnimal(animalId: string): Promise<TreatmentDose[]> {
      const rows = await db.query<DoseWithFrequencyRow>(
        `${WITH_FREQUENCY}
         WHERE dose.animal_id = ? AND dose.deleted_at IS NULL
         ORDER BY dose.treatment_id, ${HEAD_FIRST}`,
        [animalId],
      )
      return rows.map(toDose)
    },

    async getById(id: string): Promise<TreatmentDose | null> {
      const rows = await db.query<DoseWithFrequencyRow>(
        `${WITH_FREQUENCY} WHERE dose.id = ? AND dose.deleted_at IS NULL`,
        [id],
      )
      const row = rows[0]
      return row ? toDose(row) : null
    },

    /** Nombre de prises visibles par traitement de l'animal. */
    async countByAnimal(animalId: string): Promise<Record<string, number>> {
      const rows = await db.query<{ treatment_id: string; count: number }>(
        `SELECT treatment_id, COUNT(*) AS count FROM treatment_dose
         WHERE animal_id = ? AND ${NOT_DELETED} GROUP BY treatment_id`,
        [animalId],
      )
      return Object.fromEntries(rows.map((row) => [row.treatment_id, row.count]))
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<TreatmentDoseVersion[]> {
      const rows = await db.query<DoseVersionRow>(
        'SELECT id, period_id, treatment_id, updated_at, deleted_at FROM treatment_dose',
      )
      return rows.map((row) => ({
        id: row.id,
        periodId: row.period_id,
        treatmentId: row.treatment_id,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      }))
    },

    insertStatement,

    /** Prise calculée par le moteur d'échéances : aucune garde par jour, l'unicité est celle de l'échéance. */
    createStatement,

    /** Sans effet sur une ligne supprimée. */
    rewriteStatement,

    markDeletedStatement,

    /**
     * Tout ou rien. Rend le lot inverse, à appliquer pour « Annuler » ; lève, sans rien écrire, pour
     * une ligne à réécrire ou à supprimer qui n'est pas visible, ou à rétablir qui l'est.
     */
    async applyBatch(writes: readonly DoseWrite[], at: string): Promise<DoseWrite[]> {
      const existing = await rowsById(
        writes.flatMap((write) => (write.action === 'create' ? [] : [write.id])),
      )
      const visible = (id: string): DoseRow => {
        const row = existing.get(id)
        if (!row || row.deleted_at !== null) throw new Error(`Prise introuvable : ${id}`)
        return row
      }
      const steps = writes.map((write): { statement: SqlStatement; inverse: DoseWrite } => {
        switch (write.action) {
          case 'create':
            return {
              statement: createStatement({ ...write, at }),
              inverse: { action: 'delete', id: write.id },
            }
          case 'rewrite':
            return {
              statement: rewriteStatement(write.id, write.dose, at),
              inverse: { action: 'rewrite', id: write.id, dose: fieldsOf(visible(write.id)) },
            }
          case 'delete':
            visible(write.id)
            return {
              statement: markDeletedStatement([write.id], at),
              inverse: { action: 'restore', id: write.id },
            }
          case 'restore':
            if ((existing.get(write.id)?.deleted_at ?? null) === null) {
              throw new Error(`Prise non supprimée : ${write.id}`)
            }
            return {
              statement: reviveStatement(write.id, at),
              inverse: { action: 'delete', id: write.id },
            }
        }
      })
      if (steps.length > 0) await db.runMany(steps.map(({ statement }) => statement))
      return steps.map(({ inverse }) => inverse).reverse()
    },

    /** La dernière ligne de la période en cours garde sa date et son échéance ; elle n'est datée que si sa prochaine dose change. */
    updateHeadStatement(
      treatmentId: string,
      { nextDueDate, updatedAt }: Pick<NewTreatmentDose, 'nextDueDate' | 'updatedAt'>,
    ): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET next_due_date = ?, updated_at = ?
              WHERE id = ${headDoseIdSql(currentPeriodIdSql('?'))} AND next_due_date <> ?`,
        params: [nextDueDate, updatedAt, treatmentId, nextDueDate],
      }
    },

    markDeletedByTreatmentStatement(treatmentId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE treatment_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, treatmentId],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt],
      }
    },

    reviveStatement,

    /** Une prise existante garde sa période, son traitement et son animal : le reste suit le fichier. */
    restoreStatement(dose: RestoredTreatmentDose, exists: boolean): SqlStatement {
      return exists
        ? {
            sql: `UPDATE treatment_dose
                  SET due_on = ?, due_time = ?, given_on = ?, status = ?, next_due_date = ?,
                      created_at = ?, updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [
              dose.dueOn,
              dose.dueTime,
              dose.givenOn,
              dose.status,
              dose.nextDueDate,
              dose.createdAt,
              dose.updatedAt,
              dose.id,
            ],
          }
        : {
            sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (${PLACEHOLDERS})`,
            params: valuesOf({ ...dose, deletedAt: null }),
          }
    },

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<DoseRow>(`SELECT ${COLUMNS} FROM treatment_dose WHERE id = ?`, [
        id,
      ])
      return (rows[0] as SyncRow | undefined) ?? null
    },

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'treatment_dose', ['user_id', 'id'], {
        ...row,
        user_id: userId,
      })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('treatment_dose')
        .select(`${COLUMNS}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as Array<DoseRow & { server_updated_at: string }>
      const cursor = rows.length > 0 ? (rows.at(-1)?.server_updated_at ?? null) : null
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...columns }) => columns as SyncRow),
        cursor,
      }
    },

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment_dose (${COLUMNS})
              VALUES (${PLACEHOLDERS})
              ON CONFLICT (id) DO UPDATE SET
                period_id = excluded.period_id, treatment_id = excluded.treatment_id,
                animal_id = excluded.animal_id, due_on = excluded.due_on,
                due_time = excluded.due_time, given_on = excluded.given_on,
                status = excluded.status, next_due_date = excluded.next_due_date,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > treatment_dose.updated_at`,
        params: [
          row.id,
          syncField(row, 'period_id'),
          syncField(row, 'treatment_id'),
          syncField(row, 'animal_id'),
          syncField(row, 'due_on'),
          syncField(row, 'due_time'),
          syncField(row, 'given_on'),
          syncField(row, 'status'),
          syncField(row, 'next_due_date'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
        ],
      }
    },
  }
}

export type TreatmentDosesRepository = ReturnType<typeof createTreatmentDosesRepository>

let repository: Promise<TreatmentDosesRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentDosesRepository(): Promise<TreatmentDosesRepository> {
  repository ??= getDb()
    .then(createTreatmentDosesRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
