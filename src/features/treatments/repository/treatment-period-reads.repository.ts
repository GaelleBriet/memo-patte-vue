import type { DbClient } from '@/core/db/db-client'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import {
  NOT_DELETED,
  SYNC_COLUMNS,
  toPeriodRecord,
  toStampedPeriod,
  type PeriodRow,
  type StampedTreatmentPeriod,
} from './treatment-period-row.repository'

/**
 * Sous-requête de la période en cours d'un traitement (`treatmentId` est une expression SQL) : la
 * période non supprimée qui commence le plus tard, puis la dernière saisie, puis par identifiant.
 */
export function currentPeriodIdSql(treatmentId: string): string {
  return `(SELECT candidate.id FROM treatment_period candidate
           WHERE candidate.treatment_id = ${treatmentId} AND candidate.deleted_at IS NULL
           ORDER BY candidate.starts_on DESC, candidate.created_at DESC, candidate.id DESC
           LIMIT 1)`
}

export function createPeriodReads(db: DbClient) {
  async function visibleRows(scope = '', params: string[] = []): Promise<PeriodRow[]> {
    return db.query<PeriodRow>(
      `SELECT ${SYNC_COLUMNS} FROM treatment_period WHERE ${NOT_DELETED} ${scope}
       ORDER BY treatment_id, starts_on, created_at, id`,
      params,
    )
  }

  async function listVisible(scope = '', params: string[] = []): Promise<TreatmentPeriodRecord[]> {
    return (await visibleRows(scope, params)).map(toPeriodRecord)
  }

  return {
    /** Périodes visibles, toutes colonnes comprises, celles d'un même traitement de la première à la dernière. */
    listAll(): Promise<TreatmentPeriodRecord[]> {
      return listVisible()
    },

    /** Comme `listAll`, appareils compris : ce que l'export emporte. */
    async listRecords(): Promise<StampedTreatmentPeriod[]> {
      return (await visibleRows()).map(toStampedPeriod)
    },

    listByTreatment(treatmentId: string): Promise<TreatmentPeriodRecord[]> {
      return listVisible('AND treatment_id = ?', [treatmentId])
    },

    listByAnimal(animalId: string): Promise<TreatmentPeriodRecord[]> {
      return listVisible('AND animal_id = ?', [animalId])
    },
  }
}
