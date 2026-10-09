import type { VaccinationsRepository } from '../repository/vaccinations.repository'
import type {
  Vaccination,
  VaccinationInput,
  VaccinationUpdateInput,
} from '../schema/vaccination.schema'
import type { VaccinationRemindersService } from './vaccination-reminders.service'

export type VaccinationSaveDependencies = {
  vaccinations: Pick<VaccinationsRepository, 'create' | 'update'>
  reminders: () => Pick<VaccinationRemindersService, 'reschedule'>
}

export function createVaccinationSaveService({
  vaccinations,
  reminders,
}: VaccinationSaveDependencies) {
  return {
    async create(input: VaccinationInput): Promise<Vaccination> {
      const vaccination = await vaccinations.create(input)
      await reminders().reschedule(vaccination.id)
      return vaccination
    },

    async update(id: string, input: VaccinationUpdateInput): Promise<Vaccination> {
      const updated = await vaccinations.update(id, input)
      await reminders().reschedule(id)
      return updated
    },
  }
}
