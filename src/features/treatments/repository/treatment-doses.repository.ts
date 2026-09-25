import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlParam, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { FrequencyUnit } from '../schema/treatment.schema'

export type RestoredTreatmentDose = Omit<TreatmentDose, 'deletedAt'>
export type TreatmentDoseVersion = Pick<
  TreatmentDose,
  'id' | 'treatmentId' | 'givenOn' | 'updatedAt' | 'deletedAt'
>
export type DoseDates = Pick<TreatmentDose, 'givenOn' | 'nextDueDate' | 'frequency'>

interface DoseRow {
  id: string
  treatment_id: string
  animal_id: string
  given_on: string
  next_due_date: string
  frequency_value: number
  frequency_unit: FrequencyUnit
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface DoseVersionRow {
  id: string
  treatment_id: string
  given_on: string
  updated_at: string
  deleted_at: string | null
}

const COLUMNS =
  'id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at, deleted_at'

const NOT_DELETED = 'deleted_at IS NULL'

function otherVisibleDose(day?: string): string {
  return `EXISTS (
    SELECT 1 FROM treatment_dose other
    WHERE other.treatment_id = treatment_dose.treatment_id AND other.id <> treatment_dose.id
      AND other.deleted_at IS NULL${day ? ` AND other.given_on = ${day}` : ''})`
}

function toDose(row: DoseRow): TreatmentDose {
  return {
    id: row.id,
    treatmentId: row.treatment_id,
    animalId: row.animal_id,
    givenOn: row.given_on,
    nextDueDate: row.next_due_date,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

/**
 * Sous-requête de la tête d'un traitement (`treatmentId` est une expression SQL) : la prise non
 * supprimée la plus récente par date, puis par saisie, puis par identifiant.
 */
export function headDoseIdSql(treatmentId: string): string {
  return `(SELECT candidate.id FROM treatment_dose candidate
           WHERE candidate.treatment_id = ${treatmentId} AND candidate.deleted_at IS NULL
           ORDER BY candidate.given_on DESC, candidate.created_at DESC, candidate.id DESC
           LIMIT 1)`
}

// `addFrequency` en SQL, pour tenir dans une transaction : même calage en fin de mois (test de parité).
function plusFrequencySql(date: string, value: string, unit: string): string {
  const months = `'+' || ${value} || ' months'`
  return `CASE ${unit}
    WHEN 'day' THEN date(${date}, '+' || ${value} || ' days')
    WHEN 'week' THEN date(${date}, '+' || (7 * ${value}) || ' days')
    ELSE CASE WHEN strftime('%d', date(${date}, ${months})) = strftime('%d', ${date})
      THEN date(${date}, ${months})
      ELSE date(${date}, 'start of month', '+' || (${value} + 1) || ' months', '-1 day') END
  END`
}

function valuesOf(dose: TreatmentDose): SqlParam[] {
  return [
    dose.id,
    dose.treatmentId,
    dose.animalId,
    dose.givenOn,
    dose.nextDueDate,
    dose.frequency.value,
    dose.frequency.unit,
    dose.createdAt,
    dose.updatedAt,
    dose.deletedAt,
  ]
}

export interface TreatmentDosesRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
}

/**
 * Écrit seul une prise notée ou annulée ; ses autres écritures sont des instructions que le
 * repository des traitements ou un service joue.
 */
export function createTreatmentDosesRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
  }: TreatmentDosesRepositoryDependencies = {},
) {
  return {
    entity: 'treatment_dose',

    /** Faux quand une prise visible du même jour existe déjà : un double tap n'en note qu'une. */
    async record(dose: TreatmentDose): Promise<boolean> {
      const changes = await db.run(
        `INSERT INTO treatment_dose (${COLUMNS})
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM treatment_dose
           WHERE treatment_id = ? AND given_on = ? AND ${NOT_DELETED}
         )`,
        [...valuesOf(dose), dose.treatmentId, dose.givenOn],
      )
      return changes > 0
    },

    /** Prises visibles, la tête d'abord. */
    async listByTreatment(treatmentId: string): Promise<TreatmentDose[]> {
      const rows = await db.query<DoseRow>(
        `SELECT ${COLUMNS} FROM treatment_dose WHERE treatment_id = ? AND ${NOT_DELETED}
         ORDER BY given_on DESC, created_at DESC, id DESC`,
        [treatmentId],
      )
      return rows.map(toDose)
    },

    /** Prises visibles de tous les traitements, celles d'un même traitement la tête d'abord. */
    async listAll(): Promise<TreatmentDose[]> {
      const rows = await db.query<DoseRow>(
        `SELECT ${COLUMNS} FROM treatment_dose WHERE ${NOT_DELETED}
         ORDER BY treatment_id, given_on DESC, created_at DESC, id DESC`,
      )
      return rows.map(toDose)
    },

    async getById(id: string): Promise<TreatmentDose | null> {
      const rows = await db.query<DoseRow>(
        `SELECT ${COLUMNS} FROM treatment_dose WHERE id = ? AND ${NOT_DELETED}`,
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

    /**
     * Faux pour une prise déjà supprimée ou la seule visible de son traitement : un traitement
     * garde toujours au moins une prise.
     */
    async remove(id: string, deletedAt: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE treatment_dose SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED} AND ${otherVisibleDose()}`,
        [deletedAt, deletedAt, id],
      )
      return changes > 0
    },

    /** Faux pour une prise visible, ou dont le jour a été noté entre-temps. */
    async revive(id: string, updatedAt: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE treatment_dose SET deleted_at = NULL, updated_at = ?
         WHERE id = ? AND deleted_at IS NOT NULL
           AND NOT ${otherVisibleDose('treatment_dose.given_on')}`,
        [updatedAt, id],
      )
      return changes > 0
    },

    /** Faux pour une prise supprimée, ou quand une autre prise visible occupe déjà ce jour. */
    async changeDate(id: string, dates: DoseDates, updatedAt: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE treatment_dose
         SET given_on = ?, next_due_date = ?, frequency_value = ?, frequency_unit = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED} AND NOT ${otherVisibleDose('?')}`,
        [
          dates.givenOn,
          dates.nextDueDate,
          dates.frequency.value,
          dates.frequency.unit,
          updatedAt,
          id,
          dates.givenOn,
        ],
      )
      return changes > 0
    },

    /** Lignes supprimées comprises : l'import rattache un fichier aux prises déjà en base. */
    async listVersions(): Promise<TreatmentDoseVersion[]> {
      const rows = await db.query<DoseVersionRow>(
        'SELECT id, treatment_id, given_on, updated_at, deleted_at FROM treatment_dose',
      )
      return rows.map((row) => ({
        id: row.id,
        treatmentId: row.treatment_id,
        givenOn: row.given_on,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      }))
    },

    insertStatement(dose: TreatmentDose): SqlStatement {
      return {
        sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: valuesOf(dose),
      }
    },

    /** La date de la prise ne change pas ici : la tête reste la même prise. */
    updateHeadStatement(
      treatmentId: string,
      {
        nextDueDate,
        frequency,
        updatedAt,
      }: Pick<TreatmentDose, 'nextDueDate' | 'frequency' | 'updatedAt'>,
    ): SqlStatement {
      return {
        sql: `UPDATE treatment_dose
              SET next_due_date = ?, frequency_value = ?, frequency_unit = ?, updated_at = ?
              WHERE id = ${headDoseIdSql('?')}`,
        params: [nextDueDate, frequency.value, frequency.unit, updatedAt, treatmentId],
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

    reviveStatement(id: string, updatedAt: string): SqlStatement {
      return {
        sql: 'UPDATE treatment_dose SET deleted_at = NULL, updated_at = ? WHERE id = ?',
        params: [updatedAt, id],
      }
    },

    /**
     * Prise de tête d'un traitement en cours copiée d'une autre fréquence que le plan : prochaine
     * dose recalculée depuis sa date. À la fréquence du plan, elle n'est jamais touchée.
     */
    reconcileStaleHeadsStatement(updatedAt: string): SqlStatement {
      const plan = (column: string) =>
        `(SELECT treatment.${column} FROM treatment WHERE treatment.id = treatment_dose.treatment_id)`
      return {
        sql: `UPDATE treatment_dose
              SET next_due_date = ${plusFrequencySql('given_on', plan('frequency_value'), plan('frequency_unit'))},
                  frequency_value = ${plan('frequency_value')},
                  frequency_unit = ${plan('frequency_unit')},
                  updated_at = ?
              WHERE ${NOT_DELETED}
                AND id = ${headDoseIdSql('treatment_dose.treatment_id')}
                AND EXISTS (
                  SELECT 1 FROM treatment
                  WHERE treatment.id = treatment_dose.treatment_id
                    AND treatment.deleted_at IS NULL AND treatment.stopped_on IS NULL
                    AND (treatment.frequency_value <> treatment_dose.frequency_value
                      OR treatment.frequency_unit <> treatment_dose.frequency_unit))`,
        params: [updatedAt],
      }
    },

    /** Une prise existante garde son traitement et son animal : le reste suit le fichier. */
    restoreStatement(dose: RestoredTreatmentDose, exists: boolean): SqlStatement {
      return exists
        ? {
            sql: `UPDATE treatment_dose
                  SET given_on = ?, next_due_date = ?, frequency_value = ?, frequency_unit = ?,
                      updated_at = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [
              dose.givenOn,
              dose.nextDueDate,
              dose.frequency.value,
              dose.frequency.unit,
              dose.updatedAt,
              dose.id,
            ],
          }
        : {
            sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            params: [
              dose.id,
              dose.treatmentId,
              dose.animalId,
              dose.givenOn,
              dose.nextDueDate,
              dose.frequency.value,
              dose.frequency.unit,
              dose.createdAt,
              dose.updatedAt,
            ],
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
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                treatment_id = excluded.treatment_id, animal_id = excluded.animal_id,
                given_on = excluded.given_on, next_due_date = excluded.next_due_date,
                frequency_value = excluded.frequency_value, frequency_unit = excluded.frequency_unit,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > treatment_dose.updated_at`,
        params: [
          row.id,
          syncField(row, 'treatment_id'),
          syncField(row, 'animal_id'),
          syncField(row, 'given_on'),
          syncField(row, 'next_due_date'),
          syncField(row, 'frequency_value'),
          syncField(row, 'frequency_unit'),
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
