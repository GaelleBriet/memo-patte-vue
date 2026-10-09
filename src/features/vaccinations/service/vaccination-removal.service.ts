import type { VaccinationsRepository } from '../repository/vaccinations.repository'
import type { VaccinationRemindersService } from './vaccination-reminders.service'

export type VaccinationRemovalDependencies = {
  vaccinations: Pick<VaccinationsRepository, 'remove' | 'restore'>
  reminders: () => Pick<VaccinationRemindersService, 'reschedule'>
}

export function createVaccinationRemovalService({
  vaccinations,
  reminders,
}: VaccinationRemovalDependencies) {
  return {
    /** Rend l'instant de la suppression, à passer à `restore`. */
    async remove(id: string): Promise<string> {
      const deletedAt = await vaccinations.remove(id)
      await reminders().reschedule(id)
      return deletedAt
    },

    async restore(id: string, deletedAt: string): Promise<void> {
      await vaccinations.restore(id, deletedAt)
      await reminders().reschedule(id)
    },
  }
}
