import type { TreatmentType } from '@/features/treatments/treatment.schema'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/treatments.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import type { ReminderSource } from '@/shared/reminders'

type Provider<T> = () => T | Promise<T>

export type HomeReminderSource = ReminderSource & {
  treatmentType: TreatmentType | null
}

export function createHomeRemindersService(
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>,
  treatments: Provider<Pick<TreatmentsRepository, 'listAll'>>,
) {
  return {
    async listSources(): Promise<HomeReminderSource[]> {
      const [vaccinationsRepository, treatmentsRepository] = await Promise.all([
        vaccinations(),
        treatments(),
      ])
      const [vaccinationRows, treatmentRows] = await Promise.all([
        vaccinationsRepository.listAll(),
        treatmentsRepository.listAll(),
      ])

      return [
        ...vaccinationRows.map((vaccination): HomeReminderSource => ({
          kind: 'vaccination',
          id: vaccination.id,
          animalId: vaccination.animalId,
          label: vaccination.name,
          dueDate: vaccination.dueDate,
          treatmentType: null,
        })),
        ...treatmentRows.map((treatment): HomeReminderSource => ({
          kind: 'treatment',
          id: treatment.id,
          animalId: treatment.animalId,
          label: treatment.name,
          dueDate: treatment.nextDueDate,
          treatmentType: treatment.type,
        })),
      ]
    },
  }
}

export type HomeRemindersService = ReturnType<typeof createHomeRemindersService>

export const homeRemindersService = createHomeRemindersService(
  getVaccinationsRepository,
  getTreatmentsRepository,
)
