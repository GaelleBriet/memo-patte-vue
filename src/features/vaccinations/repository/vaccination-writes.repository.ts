import type { DbClient, SqlStatement } from '@/core/db/db-client'
import {
  vaccinationInputSchema,
  vaccinationUpdateSchema,
  type Vaccination,
  type VaccinationInput,
  type VaccinationUpdateInput,
} from '../schema/vaccination.schema'
import type { VaccinationInjectionsRepository } from './vaccination-injections.repository'
import type { VaccinationReads } from './vaccination-reads.repository'
import { COLUMNS, NOT_DELETED, type VaccinationRow } from './vaccination-row.repository'

export function createVaccinationWrites(
  db: DbClient,
  deviceId: () => string,
  injections: Pick<
    VaccinationInjectionsRepository,
    | 'insertStatement'
    | 'updateHeadDueStatement'
    | 'markDeletedByVaccinationStatement'
    | 'reviveByVaccinationStatement'
  >,
  { getById }: Pick<VaccinationReads, 'getById'>,
) {
  async function requireVisible(id: string): Promise<Vaccination> {
    const vaccination = await getById(id)
    if (!vaccination) {
      throw new Error(`Vaccin introuvable : ${id}`)
    }
    return vaccination
  }

  return {
    async create(input: VaccinationInput): Promise<Vaccination> {
      const data = vaccinationInputSchema.parse(input)
      const now = new Date().toISOString()
      const vaccination: Vaccination = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      const insertVaccination: SqlStatement = {
        sql: `INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        params: [
          vaccination.id,
          vaccination.animalId,
          vaccination.name,
          data.lastInjectionDate === null ? data.dueDate : null,
          now,
          now,
          deviceId(),
          deviceId(),
        ],
      }

      await db.runMany(
        data.lastInjectionDate === null
          ? [insertVaccination]
          : [
              insertVaccination,
              injections.insertStatement({
                id: vaccination.id,
                vaccinationId: vaccination.id,
                animalId: vaccination.animalId,
                injectedOn: data.lastInjectionDate,
                nextDueDate: data.dueDate,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
              }),
            ],
      )

      return vaccination
    },

    /**
     * Change le nom et le prochain rappel : celui de la dernière injection, ou le rendez-vous prévu
     * d'un vaccin sans injection, qui ne peut pas rester sans rappel.
     */
    async update(id: string, input: VaccinationUpdateInput): Promise<Vaccination> {
      const data = vaccinationUpdateSchema.parse(input)
      const current = await requireVisible(id)
      const isPlanned = current.lastInjectionDate === null
      if (isPlanned && data.dueDate === null) {
        throw new Error(`Prochain rappel obligatoire sans injection : ${id}`)
      }
      const updatedAt = new Date().toISOString()

      await db.runMany(
        isPlanned
          ? [
              {
                sql: `UPDATE vaccination
                      SET name = ?, planned_due_date = ?, updated_at = ?, updated_by_device = ?
                      WHERE id = ? AND ${NOT_DELETED}`,
                params: [data.name, data.dueDate, updatedAt, deviceId(), id],
              },
            ]
          : [
              {
                sql: `UPDATE vaccination SET name = ?, updated_at = ?, updated_by_device = ?
                      WHERE id = ? AND ${NOT_DELETED}`,
                params: [data.name, updatedAt, deviceId(), id],
              },
              injections.updateHeadDueStatement(id, { nextDueDate: data.dueDate, updatedAt }),
            ],
      )

      return requireVisible(id)
    },

    /**
     * Sans effet sur un vaccin inconnu ou déjà supprimé : la date initiale est gardée. Rend l'instant
     * de la suppression, à passer à `restore`.
     */
    async remove(id: string): Promise<string> {
      const deletedAt = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        injections.markDeletedByVaccinationStatement(id, deletedAt),
      ])
      return deletedAt
    },

    /** Rétablit le vaccin et les injections supprimés à cet instant, et eux seuls ; lève sinon. */
    async restore(id: string, deletedAt: string): Promise<void> {
      const deleted = await db.query<Pick<VaccinationRow, 'id'>>(
        'SELECT id FROM vaccination WHERE id = ? AND deleted_at = ?',
        [id, deletedAt],
      )
      if (deleted.length === 0) throw new Error(`Vaccin non rétabli : ${id}`)
      const at = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE vaccination SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND deleted_at = ?`,
          params: [at, deviceId(), id, deletedAt],
        },
        injections.reviveByVaccinationStatement(id, deletedAt, at),
      ])
    },

    plannedDueDateStatement(
      id: string,
      plannedDueDate: string | null,
      updatedAt: string,
    ): SqlStatement {
      return {
        sql: `UPDATE vaccination SET planned_due_date = ?, updated_at = ?, updated_by_device = ?
              WHERE id = ? AND ${NOT_DELETED}`,
        params: [plannedDueDate, updatedAt, deviceId(), id],
      }
    },
  }
}
