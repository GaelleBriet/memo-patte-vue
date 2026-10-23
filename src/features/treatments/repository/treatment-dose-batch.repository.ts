import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { DoseFields, DoseWrite } from '../schema/treatment-dose.schema'
import {
  DuplicateDueError,
  assertNoDuplicateInBatch,
  duplicateGuardStatement,
  duplicateWhere,
  liveParentGuardStatement,
  unchangedGuardStatement,
} from './treatment-dose-guards.repository'
import type { createDoseLineStatements } from './treatment-dose-line-statements.repository'
import { COLUMNS, fieldsOf, placeholders, type DoseRow } from './treatment-dose-row.repository'

type Step = {
  guard?: SqlStatement
  statement: SqlStatement
  after?: SqlStatement
  inverse: DoseWrite
}

/**
 * Une autre écriture est passée depuis la lecture : ligne modifiée, supprimée ou rétablie, ou
 * traitement et période supprimés. Rien n'a été écrit.
 */
export class ConcurrentWriteError extends Error {}

export function createDoseBatch(
  db: DbClient,
  {
    createStatement,
    rewriteStatement,
    markDeletedStatement,
    reviveStatement,
  }: ReturnType<typeof createDoseLineStatements>,
) {
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
              statement: rewriteStatement(write.id, write.dose, at, write.decidedAt ?? at),
              inverse: {
                action: 'rewrite',
                id: write.id,
                dose: fieldsOf(read(write)),
                ...unchanged,
                decidedAt: read(write).decided_at,
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
  }
}
