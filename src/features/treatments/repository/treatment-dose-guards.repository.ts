import type { SqlParam, SqlStatement } from '@/core/db/db-client'
import { familyOf } from '@/shared/domain/dose-calendar'
import type { DoseFields, DoseWrite } from '../schema/treatment-dose.schema'
import { COLUMNS, NOT_DELETED, placeholders, type DoseRow } from './treatment-dose-row.repository'

/** Un `create` vise une échéance qui a déjà une ligne visible de même nature : rien n'a été écrit. */
export class DuplicateDueError extends Error {}

// Q5 : une échéance a au plus une ligne visible écrite ici par famille ; la synchronisation peut en
// apporter une seconde, dont une des deux devient sans effet pour le moteur (R11).
export function duplicateWhere(dose: DoseFields): { sql: string; params: SqlParam[] } {
  const family = familyOf(dose) === 'note' ? ['given', 'missed'] : [dose.status]
  return {
    sql: `period_id = ? AND due_on = ? AND due_time IS ? AND ${NOT_DELETED}
            AND status IN (${placeholders(family)})`,
    params: [dose.periodId, dose.dueOn, dose.dueTime, ...family],
  }
}

// Réinsère la ligne en double sous son propre identifiant : la clé primaire fait échouer le lot.
export function duplicateGuardStatement(dose: DoseFields): SqlStatement {
  const where = duplicateWhere(dose)
  return {
    sql: `INSERT INTO treatment_dose (${COLUMNS})
            SELECT ${COLUMNS} FROM treatment_dose WHERE ${where.sql} LIMIT 1`,
    params: where.params,
  }
}

// Réinsère la ligne qui a changé depuis sa lecture : la clé primaire fait échouer le lot.
export function unchangedGuardStatement(row: DoseRow): SqlStatement {
  return {
    sql: `INSERT INTO treatment_dose (${COLUMNS})
            SELECT ${COLUMNS} FROM treatment_dose
            WHERE id = ? AND (deleted_at IS NOT ? OR updated_at IS NOT ?)`,
    params: [row.id, row.deleted_at, row.updated_at],
  }
}

// Réinsère la prise écrite sous un traitement ou une période supprimés : la clé primaire fait échouer le lot.
export function liveParentGuardStatement(id: string): SqlStatement {
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

export function assertNoDuplicateInBatch(writes: readonly DoseWrite[]): void {
  const dues = new Set<string>()
  for (const write of writes) {
    if (write.action !== 'create') continue
    const due = JSON.stringify(duplicateWhere(write.dose).params)
    if (dues.has(due)) throw new DuplicateDueError(`Échéance en double dans le lot : ${write.id}`)
    dues.add(due)
  }
}
