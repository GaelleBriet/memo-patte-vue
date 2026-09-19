import i18n from '@/core/i18n'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/treatments.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import { getWeightRepository, type WeightRepository } from '@/features/weight/weight.repository'
import { deliverExportFile, type DeliveryOutcome } from './export-delivery'
import { buildExportFile, type ExportFile, type ExportFormat } from './export-format'
import type { ExportData } from '@/shared/domain/carnet-data'

type Provider<T> = () => T | Promise<T>

export type DataExportDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listAll'>>
  weight: Provider<Pick<WeightRepository, 'listByAnimal'>>
  deliver: (file: ExportFile) => Promise<DeliveryOutcome>
  now: () => Date
  appVersion: string
}

export function createDataExportService({
  animals,
  vaccinations,
  treatments,
  weight,
  deliver,
  now,
  appVersion,
}: DataExportDependencies) {
  async function collect(): Promise<ExportData> {
    const [animalsRepository, vaccinationsRepository, treatmentsRepository, weightRepository] =
      await Promise.all([animals(), vaccinations(), treatments(), weight()])
    const [animalRows, vaccinationRows, treatmentRows] = await Promise.all([
      animalsRepository.list(),
      vaccinationsRepository.listAll(),
      treatmentsRepository.listAll(),
    ])
    const weightRows = (
      await Promise.all(animalRows.map((animal) => weightRepository.listByAnimal(animal.id)))
    ).flat()

    return {
      animals: animalRows.map((animal) => ({
        id: animal.id,
        name: animal.name,
        species: animal.species,
        breed: animal.breed,
        birthDate: animal.birthDate,
        initialWeightKg: animal.initialWeightKg,
        photoFileName: animal.photoPath,
        createdAt: animal.createdAt,
        updatedAt: animal.updatedAt,
      })),
      vaccinations: vaccinationRows.map((vaccination) => ({
        id: vaccination.id,
        animalId: vaccination.animalId,
        name: vaccination.name,
        lastInjectionDate: vaccination.lastInjectionDate,
        dueDate: vaccination.dueDate,
        createdAt: vaccination.createdAt,
        updatedAt: vaccination.updatedAt,
      })),
      treatments: treatmentRows.map((treatment) => ({
        id: treatment.id,
        animalId: treatment.animalId,
        name: treatment.name,
        type: treatment.type,
        frequency: { value: treatment.frequency.value, unit: treatment.frequency.unit },
        lastDoseDate: treatment.lastDoseDate,
        nextDueDate: treatment.nextDueDate,
        createdAt: treatment.createdAt,
        updatedAt: treatment.updatedAt,
      })),
      weightEntries: weightRows.map((entry) => ({
        id: entry.id,
        animalId: entry.animalId,
        weightKg: entry.weightKg,
        measuredOn: entry.measuredOn,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    }
  }

  return {
    collect,

    /** Lit la base locale seulement ; lève si la lecture ou l'écriture du fichier échoue. */
    async exportData(format: ExportFormat): Promise<DeliveryOutcome> {
      const data = await collect()
      return deliver(buildExportFile(format, data, { exportedAt: now(), appVersion }))
    },
  }
}

export type DataExportService = ReturnType<typeof createDataExportService>

export const dataExportService = createDataExportService({
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  treatments: getTreatmentsRepository,
  weight: getWeightRepository,
  deliver: (file) => deliverExportFile(file, i18n.global.t('settings.export.shareTitle')),
  now: () => new Date(),
  appVersion: import.meta.env.VITE_APP_VERSION,
})
