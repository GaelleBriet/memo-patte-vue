import i18n from '@/core/i18n'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import {
  getTreatmentDosesRepository,
  type TreatmentDosesRepository,
} from '@/features/treatments/repository/treatment-doses.repository'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import {
  getVaccinationInjectionsRepository,
  type VaccinationInjectionsRepository,
} from '@/features/vaccinations/repository/vaccination-injections.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import {
  getWeightRepository,
  type WeightRepository,
} from '@/features/weight/repository/weight.repository'
import {
  deliverExportFile,
  type DeliveryMode,
  type DeliveryOutcome,
} from '../logic/export-delivery'
import { buildExportFile, type ExportFile, type ExportFormat } from '../logic/export-format'
import type { ExportData } from '@/shared/domain/carnet-data'

type Provider<T> = () => T | Promise<T>

export type DataExportDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>
  vaccinationInjections: Provider<Pick<VaccinationInjectionsRepository, 'listAll'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listAll'>>
  treatmentDoses: Provider<Pick<TreatmentDosesRepository, 'listAll'>>
  weight: Provider<Pick<WeightRepository, 'listByAnimal'>>
  deliver: (file: ExportFile, mode: DeliveryMode) => Promise<DeliveryOutcome>
  now: () => Date
  appVersion: string
}

// Un événement exporté sans son parent ferait refuser le fichier à l'import.
function eventsOf<E>(parents: { id: string }[], events: E[], parentOf: (event: E) => string): E[] {
  const byParent = new Map<string, E[]>()
  for (const event of events) {
    byParent.set(parentOf(event), [...(byParent.get(parentOf(event)) ?? []), event])
  }
  return parents.flatMap(({ id }) => byParent.get(id) ?? [])
}

export function createDataExportService({
  animals,
  vaccinations,
  vaccinationInjections,
  treatments,
  treatmentDoses,
  weight,
  deliver,
  now,
  appVersion,
}: DataExportDependencies) {
  async function collect(): Promise<ExportData> {
    const [
      animalsRepository,
      vaccinationsRepository,
      injectionsRepository,
      treatmentsRepository,
      dosesRepository,
      weightRepository,
    ] = await Promise.all([
      animals(),
      vaccinations(),
      vaccinationInjections(),
      treatments(),
      treatmentDoses(),
      weight(),
    ])
    const [animalRows, vaccinationRows, injectionRows, treatmentRows, doseRows] = await Promise.all(
      [
        animalsRepository.list(),
        vaccinationsRepository.listAll(),
        injectionsRepository.listAll(),
        treatmentsRepository.listAll(),
        dosesRepository.listAll(),
      ],
    )
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
        createdAt: vaccination.createdAt,
        updatedAt: vaccination.updatedAt,
      })),
      vaccinationInjections: eventsOf(
        vaccinationRows,
        injectionRows,
        ({ vaccinationId }) => vaccinationId,
      ).map((injection) => ({
        id: injection.id,
        vaccinationId: injection.vaccinationId,
        animalId: injection.animalId,
        injectedOn: injection.injectedOn,
        nextDueDate: injection.nextDueDate,
        createdAt: injection.createdAt,
        updatedAt: injection.updatedAt,
      })),
      treatments: treatmentRows.map((treatment) => ({
        id: treatment.id,
        animalId: treatment.animalId,
        name: treatment.name,
        type: treatment.type,
        frequency: { value: treatment.frequency.value, unit: treatment.frequency.unit },
        stoppedOn: treatment.stoppedOn,
        createdAt: treatment.createdAt,
        updatedAt: treatment.updatedAt,
      })),
      treatmentDoses: eventsOf(treatmentRows, doseRows, ({ treatmentId }) => treatmentId).map(
        (dose) => ({
          id: dose.id,
          treatmentId: dose.treatmentId,
          animalId: dose.animalId,
          givenOn: dose.givenOn,
          nextDueDate: dose.nextDueDate,
          frequency: { value: dose.frequency.value, unit: dose.frequency.unit },
          createdAt: dose.createdAt,
          updatedAt: dose.updatedAt,
        }),
      ),
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
    async exportData(format: ExportFormat, mode: DeliveryMode): Promise<DeliveryOutcome> {
      const data = await collect()
      return deliver(buildExportFile(format, data, { exportedAt: now(), appVersion }), mode)
    },
  }
}

export type DataExportService = ReturnType<typeof createDataExportService>

export const dataExportService = createDataExportService({
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  vaccinationInjections: getVaccinationInjectionsRepository,
  treatments: getTreatmentsRepository,
  treatmentDoses: getTreatmentDosesRepository,
  weight: getWeightRepository,
  deliver: (file, mode) =>
    deliverExportFile(file, mode, i18n.global.t('settings.export.shareTitle')),
  now: () => new Date(),
  appVersion: import.meta.env.VITE_APP_VERSION,
})
