import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { TreatmentDosesRepository } from './treatment-doses.repository'
import type { TreatmentPeriodsRepository } from './treatment-periods.repository'
import { NOT_DELETED } from './treatment-row.repository'

interface DeletionCollaborators {
  periods: Pick<
    TreatmentPeriodsRepository,
    'markDeletedByTreatmentStatement' | 'reviveByTreatmentStatement'
  >
  doses: Pick<
    TreatmentDosesRepository,
    'markDeletedByTreatmentStatement' | 'reviveByTreatmentStatement'
  >
}

export function createTreatmentDeletion(
  db: DbClient,
  deviceId: () => string,
  { periods, doses }: DeletionCollaborators,
) {
  return {
    /**
     * Rend l'instant de la suppression, à passer à `restore`. Sans effet sur un traitement inconnu
     * ou déjà supprimé : la date initiale est gardée.
     */
    async remove(id: string): Promise<string> {
      const deletedAt = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        periods.markDeletedByTreatmentStatement(id, deletedAt),
        doses.markDeletedByTreatmentStatement(id, deletedAt),
      ])
      return deletedAt
    },

    /** Rétablit le traitement, ses périodes et ses prises supprimés à cet instant, et eux seuls. */
    async restore(id: string, deletedAt: string): Promise<void> {
      const at = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE treatment SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND deleted_at = ?`,
          params: [at, deviceId(), id, deletedAt],
        },
        periods.reviveByTreatmentStatement(id, deletedAt, at),
        doses.reviveByTreatmentStatement(id, deletedAt, at),
      ])
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
      }
    },

    /** Les lignes supprimées à cet instant, avec leur animal. */
    reviveByAnimalStatement(animalId: string, deletedAt: string, updatedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND deleted_at = ?`,
        params: [updatedAt, deviceId(), animalId, deletedAt],
      }
    },
  }
}
