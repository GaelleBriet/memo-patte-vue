import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlParam, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import type { NewTreatmentDose, TreatmentDose } from '../schema/treatment-dose.schema'
import type { FrequencyUnit } from '../schema/treatment.schema'
import type { Stamped } from '@/shared/domain/carnet-data'
import { familyOf, type DoseFields } from '@/shared/domain/treatment-schedule'

export type RestoredTreatmentDose = Omit<Stamped<NewTreatmentDose>, 'deletedAt'>
export type TreatmentDoseVersion = Pick<
  NewTreatmentDose,
  'id' | 'periodId' | 'treatmentId' | 'updatedAt' | 'deletedAt'
>

type DoseOwner = Pick<NewTreatmentDose, 'id' | 'treatmentId' | 'animalId'>

/** `expectedUpdatedAt` : la ligne doit être restée telle qu'un geste l'a écrite (lot inverse). */
type Unchanged = { expectedUpdatedAt?: string }

/** Une écriture du moteur d'échéances ; `restore` ne sert qu'à défaire un `delete`. */
export type DoseWrite =
  | ({ action: 'create'; dose: DoseFields } & DoseOwner)
  | ({ action: 'rewrite'; id: string; dose: DoseFields } & Unchanged)
  | ({ action: 'delete'; id: string } & Unchanged)
  | ({ action: 'restore'; id: string } & Unchanged)

type Step = {
  guard?: SqlStatement
  statement: SqlStatement
  after?: SqlStatement
  inverse: DoseWrite
}

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
  created_by_device: string
  updated_by_device: string
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
  'id, period_id, treatment_id, animal_id, due_on, due_time, given_on, status, next_due_date, ' +
  'created_at, updated_at, deleted_at, created_by_device, updated_by_device'

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

function toRecord(row: DoseWithFrequencyRow): Stamped<TreatmentDose> {
  return {
    ...toDose(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}

function valuesOf(dose: Stamped<NewTreatmentDose>): SqlParam[] {
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
    dose.createdByDevice,
    dose.updatedByDevice,
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

/** Un `create` vise une échéance qui a déjà une ligne visible de même nature : rien n'a été écrit. */
export class DuplicateDueError extends Error {}

/**
 * Une autre écriture est passée depuis la lecture : ligne modifiée, supprimée ou rétablie, ou
 * traitement et période supprimés. Rien n'a été écrit.
 */
export class ConcurrentWriteError extends Error {}

export interface TreatmentDosesRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

export function createTreatmentDosesRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: TreatmentDosesRepositoryDependencies = {},
) {
  function insertStatement(dose: NewTreatmentDose): SqlStatement {
    const device = deviceId()
    return {
      sql: `INSERT INTO treatment_dose (${COLUMNS}) VALUES (${PLACEHOLDERS})`,
      params: valuesOf({ ...dose, createdByDevice: device, updatedByDevice: device }),
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
                next_due_date = ?, updated_at = ?, updated_by_device = ?
            WHERE id = ? AND ${NOT_DELETED}`,
      params: [
        dose.periodId,
        dose.dueOn,
        dose.dueTime,
        dose.givenOn,
        dose.status,
        dose.nextDueDate,
        updatedAt,
        deviceId(),
        id,
      ],
    }
  }

  function markDeletedStatement(ids: readonly string[], deletedAt: string): SqlStatement {
    return {
      sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ?, updated_by_device = ?
            WHERE id IN (${placeholders(ids)}) AND ${NOT_DELETED}`,
      params: [deletedAt, deletedAt, deviceId(), ...ids],
    }
  }

  function reviveStatement(id: string, updatedAt: string): SqlStatement {
    return {
      sql: `UPDATE treatment_dose SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
            WHERE id = ?`,
      params: [updatedAt, deviceId(), id],
    }
  }

  // Q5 : une échéance a au plus une ligne visible par famille (prise, prise en plus, report, décalage).
  function duplicateWhere(dose: DoseFields): { sql: string; params: SqlParam[] } {
    const family = familyOf(dose) === 'note' ? ['given', 'missed'] : [dose.status]
    return {
      sql: `period_id = ? AND due_on = ? AND due_time IS ? AND ${NOT_DELETED}
            AND status IN (${placeholders(family)})`,
      params: [dose.periodId, dose.dueOn, dose.dueTime, ...family],
    }
  }

  // Réinsère la ligne en double sous son propre identifiant : la clé primaire fait échouer le lot.
  function duplicateGuardStatement(dose: DoseFields): SqlStatement {
    const where = duplicateWhere(dose)
    return {
      sql: `INSERT INTO treatment_dose (${COLUMNS})
            SELECT ${COLUMNS} FROM treatment_dose WHERE ${where.sql} LIMIT 1`,
      params: where.params,
    }
  }

  // Réinsère la ligne qui a changé depuis sa lecture : la clé primaire fait échouer le lot.
  function unchangedGuardStatement(row: DoseRow): SqlStatement {
    return {
      sql: `INSERT INTO treatment_dose (${COLUMNS})
            SELECT ${COLUMNS} FROM treatment_dose
            WHERE id = ? AND (deleted_at IS NOT ? OR updated_at IS NOT ?)`,
      params: [row.id, row.deleted_at, row.updated_at],
    }
  }

  // Réinsère la prise écrite sous un traitement ou une période supprimés : la clé primaire fait échouer le lot.
  function liveParentGuardStatement(id: string): SqlStatement {
    return {
      sql: `INSERT INTO treatment_dose (${COLUMNS})
            SELECT ${COLUMNS} FROM treatment_dose dose
            WHERE dose.id = ? AND NOT EXISTS (
              SELECT 1 FROM treatment_period period
              JOIN treatment ON treatment.id = period.treatment_id
              WHERE period.id = dose.period_id AND period.deleted_at IS NULL
                AND treatment.deleted_at IS NULL)`,
      params: [id],
    }
  }

  function assertNoDuplicateInBatch(writes: readonly DoseWrite[]): void {
    const dues = new Set<string>()
    for (const write of writes) {
      if (write.action !== 'create') continue
      const due = JSON.stringify(duplicateWhere(write.dose).params)
      if (dues.has(due)) throw new DuplicateDueError(`Échéance en double dans le lot : ${write.id}`)
      dues.add(due)
    }
  }

  async function hasDuplicate(dose: DoseFields): Promise<boolean> {
    const where = duplicateWhere(dose)
    const rows = await db.query<{ id: string }>(
      `SELECT id FROM treatment_dose WHERE ${where.sql} LIMIT 1`,
      where.params,
    )
    return rows.length > 0
  }

  async function changedSinceRead(
    writes: readonly DoseWrite[],
    existing: ReadonlyMap<string, DoseRow>,
  ): Promise<boolean> {
    const current = await rowsById([...existing.keys()])
    for (const [id, row] of existing) {
      const now = current.get(id)
      if (now?.deleted_at !== row.deleted_at || now.updated_at !== row.updated_at) return true
    }
    const periodIds = writes.flatMap((write) => {
      if (write.action === 'create') return [write.dose.periodId]
      if (write.action === 'restore') return [existing.get(write.id)?.period_id ?? '']
      return []
    })
    if (periodIds.length === 0) return false
    const deleted = await db.query<{ id: string }>(
      `SELECT period.id FROM treatment_period period
       JOIN treatment ON treatment.id = period.treatment_id
       WHERE period.id IN (${placeholders(periodIds)})
         AND (period.deleted_at IS NOT NULL OR treatment.deleted_at IS NOT NULL)
       LIMIT 1`,
      periodIds,
    )
    return deleted.length > 0
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

    /** Comme `listAll`, toutes colonnes comprises : ce que l'export emporte. */
    async listRecords(): Promise<Stamped<TreatmentDose>[]> {
      const rows = await db.query<DoseWithFrequencyRow>(
        `${WITH_FREQUENCY}
         WHERE dose.deleted_at IS NULL
         ORDER BY dose.treatment_id, ${HEAD_FIRST}`,
      )
      return rows.map(toRecord)
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
     * Tout ou rien, `also` compris : les instructions d'une autre table à jouer dans la même
     * transaction. Rend le lot inverse, à appliquer pour « Annuler » ; lève, sans rien écrire, pour
     * une ligne à réécrire ou à supprimer qui n'est pas visible, à rétablir qui l'est, modifiée depuis
     * `expectedUpdatedAt` ou entre sa lecture et l'écriture, pour une prise créée ou rétablie sous un
     * traitement ou une période supprimés (`ConcurrentWriteError` pour ces deux cas), et une
     * `DuplicateDueError` pour une création en double.
     */
    async applyBatch(
      writes: readonly DoseWrite[],
      at: string,
      also: readonly SqlStatement[] = [],
    ): Promise<DoseWrite[]> {
      assertNoDuplicateInBatch(writes)
      const existing = await rowsById(
        writes.flatMap((write) => (write.action === 'create' ? [] : [write.id])),
      )
      const read = (write: Exclude<DoseWrite, { action: 'create' }>): DoseRow => {
        const row = existing.get(write.id)
        const deleted = (row?.deleted_at ?? null) !== null
        if (write.action === 'restore' && !deleted) {
          throw new Error(`Prise non supprimée : ${write.id}`)
        }
        if (!row || (write.action !== 'restore' && deleted)) {
          throw new Error(`Prise introuvable : ${write.id}`)
        }
        if (write.expectedUpdatedAt !== undefined && row.updated_at !== write.expectedUpdatedAt) {
          throw new ConcurrentWriteError(`Prise modifiée depuis : ${write.id}`)
        }
        return row
      }
      const unchanged = { expectedUpdatedAt: at }
      const steps = writes.map((write): Step => {
        switch (write.action) {
          case 'create':
            return {
              guard: duplicateGuardStatement(write.dose),
              statement: createStatement({ ...write, at }),
              after: liveParentGuardStatement(write.id),
              inverse: { action: 'delete', id: write.id, ...unchanged },
            }
          case 'rewrite':
            return {
              statement: rewriteStatement(write.id, write.dose, at),
              inverse: {
                action: 'rewrite',
                id: write.id,
                dose: fieldsOf(read(write)),
                ...unchanged,
              },
            }
          case 'delete':
            read(write)
            return {
              statement: markDeletedStatement([write.id], at),
              inverse: { action: 'restore', id: write.id, ...unchanged },
            }
          case 'restore':
            read(write)
            return {
              statement: reviveStatement(write.id, at),
              after: liveParentGuardStatement(write.id),
              inverse: { action: 'delete', id: write.id, ...unchanged },
            }
        }
      })
      if (steps.length + also.length === 0) return []
      try {
        await db.runMany([
          ...[...existing.values()].map(unchangedGuardStatement),
          ...steps.flatMap(({ guard, statement, after }) =>
            [guard, statement, after].filter((step) => step !== undefined),
          ),
          ...also,
        ])
      } catch (cause) {
        for (const write of writes) {
          if (write.action === 'create' && (await hasDuplicate(write.dose))) {
            throw new DuplicateDueError(`Échéance déjà notée : ${write.id}`, { cause })
          }
        }
        if (await changedSinceRead(writes, existing)) {
          throw new ConcurrentWriteError('Prise modifiée pendant l’écriture', { cause })
        }
        throw cause
      }
      return steps.map(({ inverse }) => inverse).reverse()
    },

    markDeletedByTreatmentStatement(treatmentId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE treatment_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), treatmentId],
      }
    },

    /** Les prises supprimées à cet instant, avec leur traitement. */
    reviveByTreatmentStatement(
      treatmentId: string,
      deletedAt: string,
      updatedAt: string,
    ): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE treatment_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), treatmentId, deletedAt],
      }
    },

    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
      }
    },

    /** Les lignes supprimées à cet instant, avec leur animal. */
    reviveByAnimalStatement(animalId: string, deletedAt: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), animalId, deletedAt],
      }
    },

    eraseAllStatement(): SqlStatement {
      return { sql: 'DELETE FROM treatment_dose' }
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_dose SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    reviveStatement,

    /** Une prise existante garde sa période, son traitement et son animal : le reste suit le fichier. */
    restoreStatement(dose: RestoredTreatmentDose, exists: boolean): SqlStatement {
      return exists
        ? {
            sql: `UPDATE treatment_dose
                  SET due_on = ?, due_time = ?, given_on = ?, status = ?, next_due_date = ?,
                      created_at = ?, updated_at = ?, deleted_at = NULL, created_by_device = ?,
                      updated_by_device = ?
                  WHERE id = ?`,
            params: [
              dose.dueOn,
              dose.dueTime,
              dose.givenOn,
              dose.status,
              dose.nextDueDate,
              dose.createdAt,
              dose.updatedAt,
              dose.createdByDevice,
              dose.updatedByDevice,
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

    ...createRemoteSyncTable({ table: 'treatment_dose', columns: COLUMNS, loadClient }),

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
                deleted_at = excluded.deleted_at, created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
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
          syncField(row, 'created_by_device'),
          syncField(row, 'updated_by_device'),
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
