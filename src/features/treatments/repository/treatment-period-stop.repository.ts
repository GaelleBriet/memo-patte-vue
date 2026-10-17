import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { NOT_DELETED, SYNC_COLUMNS } from './treatment-period-row.repository'

export function createPeriodStop(db: DbClient, deviceId: () => string) {
  function stopStatement(
    periodId: string,
    stoppedOn: string,
    updatedAt: string,
  ): Required<SqlStatement> {
    return {
      sql: `UPDATE treatment_period SET stopped_on = ?, updated_at = ?, updated_by_device = ?
            WHERE id = ? AND stopped_on IS NULL AND ${NOT_DELETED}`,
      params: [stoppedOn, updatedAt, deviceId(), periodId],
    }
  }

  // Réinsère la période déjà arrêtée sous son propre identifiant : la clé primaire fait échouer le lot.
  function notStoppedGuardStatement(periodId: string): Required<SqlStatement> {
    return {
      sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
            SELECT ${SYNC_COLUMNS} FROM treatment_period
            WHERE id = ? AND stopped_on IS NOT NULL`,
      params: [periodId],
    }
  }

  function undoStopStatement(periodId: string, updatedAt: string): Required<SqlStatement> {
    return {
      sql: `UPDATE treatment_period SET stopped_on = NULL, updated_at = ?, updated_by_device = ?
            WHERE id = ? AND stopped_on IS NOT NULL`,
      params: [updatedAt, deviceId(), periodId],
    }
  }

  return {
    /** Faux quand la période est déjà arrêtée, ou inconnue : rien n'est écrit. */
    async stop(periodId: string, stoppedOn: string): Promise<boolean> {
      const { sql, params } = stopStatement(periodId, stoppedOn, new Date().toISOString())
      return (await db.run(sql, params)) > 0
    },

    async undoStop(periodId: string): Promise<void> {
      const { sql, params } = undoStopStatement(periodId, new Date().toISOString())
      await db.run(sql, params)
    },

    /** L'arrêt, à jouer dans la transaction des prises renseignées avec lui. */
    stopStatement,

    /** Fait échouer la transaction quand la période est déjà arrêtée. */
    notStoppedGuardStatement,

    undoStopStatement,

    /** Sans effet sur une période déjà arrêtée : sa date d'arrêt est gardée. */
    stopPeriodStatement(periodId: string, stoppedOn: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET stopped_on = ?, updated_at = ?, updated_by_device = ?
              WHERE id = ? AND stopped_on IS NULL`,
        params: [stoppedOn, updatedAt, deviceId(), periodId],
      }
    },

    /** Défait l'arrêt de `stopPeriodStatement`, seulement si la période est arrêtée ce jour-là. */
    undoStopPeriodStatement(periodId: string, stoppedOn: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment_period SET stopped_on = NULL, updated_at = ?, updated_by_device = ?
              WHERE id = ? AND stopped_on = ?`,
        params: [updatedAt, deviceId(), periodId, stoppedOn],
      }
    },
  }
}
