import type { DbClient } from '@/core/db/db-client'
import type { Stamped } from '@/shared/domain/carnet-data'
import type { NewTreatmentDose, TreatmentDose } from '../schema/treatment-dose.schema'
import {
  HEAD_FIRST,
  WITH_FREQUENCY,
  toDose,
  toRecord,
  type DoseVersionRow,
  type DoseWithFrequencyRow,
} from './treatment-dose-row.repository'

export type TreatmentDoseVersion = Pick<
  NewTreatmentDose,
  'id' | 'periodId' | 'treatmentId' | 'updatedAt' | 'deletedAt'
>

export function createDoseReads(db: DbClient) {
  return {
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
  }
}
