import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { InjectionDates, VaccinationInjection } from '../schema/vaccination-injection.schema'
import { NOT_DELETED } from './vaccination-injection-row.repository'
import type { VaccinationInjectionReads } from './vaccination-injection-reads.repository'
import type { createVaccinationInjectionStatements } from './vaccination-injection-statements.repository'

type Statements = ReturnType<typeof createVaccinationInjectionStatements>

export function createVaccinationInjectionWrites(
  db: DbClient,
  deviceId: () => string,
  reads: Pick<VaccinationInjectionReads, 'getById'>,
  statements: Pick<Statements, 'insertStatement' | 'reviveStatement'>,
) {
  return {
    async record(injection: VaccinationInjection): Promise<void> {
      const { sql, params } = statements.insertStatement(injection)
      await db.run(sql, params)
    },

    /** Faux pour une injection déjà supprimée ; `also` s'écrit dans la même transaction. */
    async remove(
      id: string,
      deletedAt: string,
      also: readonly SqlStatement[] = [],
    ): Promise<boolean> {
      if ((await reads.getById(id)) === null) return false
      await db.runMany([
        {
          sql: `UPDATE vaccination_injection SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        ...also,
      ])
      return true
    },

    /** Faux pour une injection encore visible ; `also` s'écrit dans la même transaction. */
    async revive(
      id: string,
      updatedAt: string,
      also: readonly SqlStatement[] = [],
    ): Promise<boolean> {
      const deleted = await db.query<{ id: string }>(
        'SELECT id FROM vaccination_injection WHERE id = ? AND deleted_at IS NOT NULL',
        [id],
      )
      if (deleted.length === 0) return false
      await db.runMany([statements.reviveStatement(id, updatedAt), ...also])
      return true
    },

    /** Faux pour une injection supprimée. */
    async changeDate(id: string, dates: InjectionDates, updatedAt: string): Promise<boolean> {
      const changes = await db.run(
        `UPDATE vaccination_injection
         SET injected_on = ?, next_due_date = ?, updated_at = ?, updated_by_device = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [dates.injectedOn, dates.nextDueDate, updatedAt, deviceId(), id],
      )
      return changes > 0
    },
  }
}
