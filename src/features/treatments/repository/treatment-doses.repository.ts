import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlParam, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import type { DoseFields, DoseWrite } from '../schema/treatment-dose.schema'
import {
  COLUMNS,
  NOT_DELETED,
  fieldsOf,
  placeholders,
  type DoseRow,
} from './treatment-dose-row.repository'
import { createDoseCascadeStatements } from './treatment-dose-cascade-statements.repository'
import { restoreStatement } from './treatment-dose-import.repository'
import { createDoseLineStatements } from './treatment-dose-line-statements.repository'
import { createDoseSync } from './treatment-dose-sync.repository'
import { createDoseReads } from './treatment-dose-reads.repository'
import { rankedStamp, undoRanks } from '../logic/treatment-undo-order'
import { familyOf } from '@/shared/domain/dose-calendar'

export type { TreatmentDoseVersion } from './treatment-dose-reads.repository'
export type { RestoredTreatmentDose } from './treatment-dose-import.repository'

type Step = {
  guard?: SqlStatement
  statement: SqlStatement
  after?: SqlStatement
  inverse: DoseWrite
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
  const { reviveStatement, ...lineStatements } = createDoseLineStatements(deviceId)
  const { createStatement, rewriteStatement, markDeletedStatement } = lineStatements

  // Q5 : une échéance a au plus une ligne visible écrite ici par famille ; la synchronisation peut en
  // apporter une seconde, dont une des deux devient sans effet pour le moteur (R11).
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

    ...createDoseReads(db),

    ...lineStatements,

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
      const rankOf = undoRanks(
        [...existing.values()].map(({ id, updated_at }) => ({ id, updatedAt: updated_at })),
      )
      const steps = writes.map((write): Step => {
        switch (write.action) {
          case 'create':
            return {
              guard: duplicateGuardStatement(write.dose),
              statement: createStatement({ ...write, at }),
              after: liveParentGuardStatement(write.id),
              inverse: { action: 'delete', id: write.id, ...unchanged },
            }
          case 'rewrite': {
            const stamp = rankedStamp(at, write.rank)
            return {
              statement: rewriteStatement(write.id, write.dose, stamp),
              inverse: {
                action: 'rewrite',
                id: write.id,
                dose: fieldsOf(read(write)),
                expectedUpdatedAt: stamp,
                rank: rankOf(write.id),
              },
            }
          }
          case 'delete':
            read(write)
            return {
              statement: markDeletedStatement([write.id], at),
              inverse: { action: 'restore', id: write.id, ...unchanged, rank: rankOf(write.id) },
            }
          case 'restore': {
            read(write)
            const stamp = rankedStamp(at, write.rank)
            return {
              statement: reviveStatement(write.id, stamp),
              after: liveParentGuardStatement(write.id),
              inverse: { action: 'delete', id: write.id, expectedUpdatedAt: stamp },
            }
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

    ...createDoseCascadeStatements(deviceId),

    reviveStatement,

    restoreStatement,

    ...createDoseSync(db, loadClient),
  }
}

export type TreatmentDosesRepository = ReturnType<typeof createTreatmentDosesRepository>
export type TreatmentDoseWriter = Pick<TreatmentDosesRepository, 'applyBatch'>

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
