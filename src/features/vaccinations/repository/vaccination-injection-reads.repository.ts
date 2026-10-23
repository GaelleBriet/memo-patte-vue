import type { DbClient } from '@/core/db/db-client'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import {
  COLUMNS,
  NOT_DELETED,
  toInjection,
  toRecord,
  type InjectionRow,
  type InjectionVersionRow,
  type VaccinationInjectionRecord,
  type VaccinationInjectionVersion,
} from './vaccination-injection-row.repository'

export function createVaccinationInjectionReads(db: DbClient) {
  return {
    async getById(id: string): Promise<VaccinationInjection | null> {
      const rows = await db.query<InjectionRow>(
        `SELECT ${COLUMNS} FROM vaccination_injection WHERE id = ? AND ${NOT_DELETED}`,
        [id],
      )
      const row = rows[0]
      return row ? toInjection(row) : null
    },

    /** Injections visibles, la tête d'abord. */
    async listByVaccination(vaccinationId: string): Promise<VaccinationInjection[]> {
      const rows = await db.query<InjectionRow>(
        `SELECT ${COLUMNS} FROM vaccination_injection WHERE vaccination_id = ? AND ${NOT_DELETED}
         ORDER BY injected_on DESC, created_at DESC, id DESC`,
        [vaccinationId],
      )
      return rows.map(toInjection)
    },

    /** Injections visibles de tous les vaccins, celles d'un même vaccin la tête d'abord. */
    async listAll(): Promise<VaccinationInjectionRecord[]> {
      const rows = await db.query<InjectionRow>(
        `SELECT ${COLUMNS} FROM vaccination_injection WHERE ${NOT_DELETED}
         ORDER BY vaccination_id, injected_on DESC, created_at DESC, id DESC`,
      )
      return rows.map(toRecord)
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<VaccinationInjectionVersion[]> {
      const rows = await db.query<InjectionVersionRow>(
        'SELECT id, vaccination_id, updated_at, deleted_at FROM vaccination_injection',
      )
      return rows.map((row) => ({
        id: row.id,
        vaccinationId: row.vaccination_id,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      }))
    },
  }
}

export type VaccinationInjectionReads = ReturnType<typeof createVaccinationInjectionReads>
