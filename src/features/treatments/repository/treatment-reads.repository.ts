import type { DbClient } from '@/core/db/db-client'
import type { TreatmentDosesRepository } from './treatment-doses.repository'
import { currentPeriodIdSql, type TreatmentPeriodsRepository } from './treatment-periods.repository'
import {
  COLUMNS,
  NOT_DELETED,
  toRecord,
  toStampedRecord,
  toTreatment,
  type StampedTreatmentRecord,
  type TreatmentRow,
  type TreatmentWithPeriodRow,
} from './treatment-row.repository'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Treatment } from '../schema/treatment.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import type { Stamped } from '@/shared/domain/carnet-data'
import { groupBy } from '@/shared/utils/group-by'

/** Le traitement est daté de la modification la plus récente entre lui et sa période en cours. */
const VISIBLE_WITH_PERIOD = `
  SELECT treatment.id, treatment.animal_id, treatment.name, treatment.type,
         period.id AS period_id, period.frequency_value, period.frequency_unit, period.stopped_on,
         treatment.created_at, MAX(treatment.updated_at, period.updated_at) AS updated_at,
         treatment.deleted_at
  FROM treatment
  JOIN treatment_period period ON period.id = ${currentPeriodIdSql('treatment.id')}
  WHERE treatment.deleted_at IS NULL`

/** Sans période visible, un traitement ne se lit pas ; les prises d'une période supprimée non plus. */
function withPeriods(
  rows: TreatmentRow[],
  periods: TreatmentPeriodRecord[],
  doses: Stamped<TreatmentDose>[],
): TreatmentWithPeriods[] {
  const periodsOf = groupBy(periods, ({ treatmentId }) => treatmentId)
  const dosesOf = groupBy(doses, ({ periodId }) => periodId)
  return rows.flatMap((row) => {
    const own = periodsOf.get(row.id)
    if (!own) return []
    return [
      {
        ...toRecord(row),
        periods: own,
        doses: own.flatMap(({ id }) =>
          (dosesOf.get(id) ?? []).map(({ updatedByDevice: _updatedBy, ...dose }) => dose),
        ),
      },
    ]
  })
}

export function createTreatmentReads(
  db: DbClient,
  periods: Pick<TreatmentPeriodsRepository, 'listByTreatment' | 'listByAnimal' | 'listAll'>,
  doses: Pick<
    TreatmentDosesRepository,
    'listRecordsByTreatment' | 'listRecordsByAnimal' | 'listRecords' | 'listByTreatment'
  >,
) {
  return {
    async getById(id: string): Promise<Treatment | null> {
      const rows = await db.query<TreatmentWithPeriodRow>(
        `${VISIBLE_WITH_PERIOD} AND treatment.id = ?`,
        [id],
      )
      const row = rows[0]
      return row ? toTreatment(row) : null
    },

    /** Dans l'ordre de saisie des traitements. */
    async listByAnimal(animalId: string): Promise<Treatment[]> {
      const rows = await db.query<TreatmentWithPeriodRow>(
        `${VISIBLE_WITH_PERIOD} AND treatment.animal_id = ?
         ORDER BY treatment.created_at, treatment.id`,
        [animalId],
      )
      return rows.map(toTreatment)
    },

    async listAll(): Promise<Treatment[]> {
      const rows = await db.query<TreatmentWithPeriodRow>(
        `${VISIBLE_WITH_PERIOD}
         ORDER BY treatment.animal_id, treatment.created_at, treatment.id`,
      )
      return rows.map(toTreatment)
    },

    /** Traitements visibles, qu'ils aient ou non une prise. */
    async listRecords(): Promise<StampedTreatmentRecord[]> {
      const rows = await db.query<TreatmentRow>(
        `SELECT ${COLUMNS} FROM treatment WHERE ${NOT_DELETED}
         ORDER BY animal_id, created_at, id`,
      )
      return rows.map(toStampedRecord)
    },

    async getWithPeriods(id: string): Promise<TreatmentWithPeriods | null> {
      const [rows, ownPeriods, ownDoses] = await Promise.all([
        db.query<TreatmentRow>(`SELECT ${COLUMNS} FROM treatment WHERE ${NOT_DELETED} AND id = ?`, [
          id,
        ]),
        periods.listByTreatment(id),
        doses.listRecordsByTreatment(id),
      ])
      return withPeriods(rows, ownPeriods, ownDoses)[0] ?? null
    },

    /** Dans l'ordre de saisie des traitements. */
    async listWithPeriodsByAnimal(animalId: string): Promise<TreatmentWithPeriods[]> {
      const [rows, ownPeriods, ownDoses] = await Promise.all([
        db.query<TreatmentRow>(
          `SELECT ${COLUMNS} FROM treatment WHERE ${NOT_DELETED} AND animal_id = ?
           ORDER BY created_at, id`,
          [animalId],
        ),
        periods.listByAnimal(animalId),
        doses.listRecordsByAnimal(animalId),
      ])
      return withPeriods(rows, ownPeriods, ownDoses)
    },

    /** Par animal, puis dans l'ordre de saisie des traitements. */
    async listAllWithPeriods(): Promise<TreatmentWithPeriods[]> {
      const [rows, allPeriods, allDoses] = await Promise.all([
        db.query<TreatmentRow>(
          `SELECT ${COLUMNS} FROM treatment WHERE ${NOT_DELETED}
           ORDER BY animal_id, created_at, id`,
        ),
        periods.listAll(),
        doses.listRecords(),
      ])
      return withPeriods(rows, allPeriods, allDoses)
    },

    listDoses(treatmentId: string): Promise<TreatmentDose[]> {
      return doses.listByTreatment(treatmentId)
    },
  }
}
