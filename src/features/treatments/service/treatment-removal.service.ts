import type { TreatmentsRepository } from '../repository/treatments.repository'
import type { TreatmentRemindersService } from './treatment-reminders.service'

export type TreatmentRemovalDependencies = {
  treatments: Pick<TreatmentsRepository, 'remove' | 'restore'>
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
}

export function createTreatmentRemovalService({
  treatments,
  reminders,
}: TreatmentRemovalDependencies) {
  return {
    /** Rend l'instant de la suppression, à passer à `restore`. */
    async remove(id: string): Promise<string> {
      const deletedAt = await treatments.remove(id)
      await reminders.reschedule(id)
      return deletedAt
    },

    async restore(id: string, deletedAt: string): Promise<void> {
      await treatments.restore(id, deletedAt)
      await reminders.reschedule(id)
    },
  }
}
