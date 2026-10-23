import type { DbClient } from '@/core/db/db-client'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'
import type { VaccinationInjectionsRepository } from './vaccination-injections.repository'
import {
  COLUMNS,
  NOT_DELETED,
  REPLACED_DUES,
  VISIBLE_WITH_HEAD,
  toVaccination,
  toVaccinationRecord,
  type ReplacedDueRow,
  type VaccinationRecord,
  type VaccinationRow,
  type VaccinationWithHeadRow,
} from './vaccination-row.repository'

export function createVaccinationReads(
  db: DbClient,
  injections: Pick<VaccinationInjectionsRepository, 'listByVaccination'>,
) {
  return {
    async getById(id: string): Promise<Vaccination | null> {
      const rows = await db.query<VaccinationWithHeadRow>(
        `${VISIBLE_WITH_HEAD} AND vaccination.id = ?`,
        [id],
      )
      const row = rows[0]
      return row ? toVaccination(row) : null
    },

    async listByAnimal(animalId: string): Promise<Vaccination[]> {
      const rows = await db.query<VaccinationWithHeadRow>(
        `${VISIBLE_WITH_HEAD} AND vaccination.animal_id = ?
         ORDER BY head.injected_on DESC, vaccination.name COLLATE NOCASE`,
        [animalId],
      )
      return rows.map(toVaccination)
    },

    async listAll(): Promise<Vaccination[]> {
      const rows = await db.query<VaccinationWithHeadRow>(
        `${VISIBLE_WITH_HEAD}
         ORDER BY vaccination.animal_id, head.injected_on DESC, vaccination.name COLLATE NOCASE`,
      )
      return rows.map(toVaccination)
    },

    /** Vaccins visibles, rappel prévu compris, qu'ils aient ou non une injection. */
    async listRecords(): Promise<VaccinationRecord[]> {
      const rows = await db.query<VaccinationRow>(
        `SELECT ${COLUMNS} FROM vaccination WHERE ${NOT_DELETED}
         ORDER BY animal_id, created_at, id`,
      )
      return rows.map(toVaccinationRecord)
    },

    async listReplacedDues(vaccinationId: string): Promise<string[]> {
      const rows = await db.query<ReplacedDueRow>(
        `SELECT due_date FROM (${REPLACED_DUES}) WHERE vaccination_id = ? ORDER BY due_date`,
        [vaccinationId],
      )
      return rows.map(({ due_date }) => due_date)
    },

    async listAllReplacedDues(): Promise<Map<string, string[]>> {
      const rows = await db.query<ReplacedDueRow>(`${REPLACED_DUES} ORDER BY 1, 2`)
      const dues = new Map<string, string[]>()
      for (const { vaccination_id, due_date } of rows) {
        dues.set(vaccination_id, [...(dues.get(vaccination_id) ?? []), due_date])
      }
      return dues
    },

    listInjections(vaccinationId: string): Promise<VaccinationInjection[]> {
      return injections.listByVaccination(vaccinationId)
    },

    /** Rendez-vous prévu, gardé même quand une injection existe ; `null` pour un vaccin inconnu. */
    async getPlannedDueDate(id: string): Promise<string | null> {
      const rows = await db.query<Pick<VaccinationRow, 'planned_due_date'>>(
        `SELECT planned_due_date FROM vaccination WHERE id = ? AND ${NOT_DELETED}`,
        [id],
      )
      return rows[0]?.planned_due_date ?? null
    },
  }
}

export type VaccinationReads = ReturnType<typeof createVaccinationReads>
