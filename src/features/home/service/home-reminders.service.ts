import type { TreatmentType } from '@/features/treatments/schema/treatment.schema'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import type { ReminderSource } from '@/shared/domain/reminders'
import type { TreatmentDoseInput, TreatmentPeriodInput } from '@/shared/domain/treatment-schedule'

type Provider<T> = () => T | Promise<T>

export type HomeVaccinationSource = ReminderSource & {
  kind: 'vaccination'
  treatmentType: null
}

/** Ce que lit le moteur d'échéances : toutes les périodes et les prises visibles. */
export type HomeTreatmentSource = {
  kind: 'treatment'
  id: string
  animalId: string
  label: string
  treatmentType: TreatmentType
  periods: readonly TreatmentPeriodInput[]
  doses: readonly TreatmentDoseInput[]
}

export type HomeReminderSource = HomeVaccinationSource | HomeTreatmentSource

export function createHomeRemindersService(
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>,
  treatments: Provider<Pick<TreatmentsRepository, 'listAllWithHistory'>>,
) {
  return {
    async listSources(): Promise<HomeReminderSource[]> {
      const [vaccinationsRepository, treatmentsRepository] = await Promise.all([
        vaccinations(),
        treatments(),
      ])
      const [vaccinationRows, treatmentRows] = await Promise.all([
        vaccinationsRepository.listAll(),
        treatmentsRepository.listAllWithHistory(),
      ])

      return [
        ...vaccinationRows.map((vaccination): HomeVaccinationSource => ({
          kind: 'vaccination',
          id: vaccination.id,
          animalId: vaccination.animalId,
          label: vaccination.name,
          dueDate: vaccination.dueDate,
          treatmentType: null,
        })),
        ...treatmentRows.map((treatment): HomeTreatmentSource => ({
          kind: 'treatment',
          id: treatment.id,
          animalId: treatment.animalId,
          label: treatment.name,
          treatmentType: treatment.type,
          periods: treatment.periods,
          doses: treatment.doses,
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
