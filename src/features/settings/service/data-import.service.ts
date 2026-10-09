import { syncAllReminders } from '@/features/treatments/service/reminders-sync.service'
import { currentDeviceId } from '@/core/device/device-identity'
import { getDeviceRepository, type DeviceRepository } from '@/core/device/device.repository'
import { photoExists } from '@/core/photos/photo-storage'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import {
  getTreatmentDosesRepository,
  type TreatmentDosesRepository,
} from '@/features/treatments/repository/treatment-doses.repository'
import {
  getTreatmentPeriodsRepository,
  type TreatmentPeriodsRepository,
} from '@/features/treatments/repository/treatment-periods.repository'
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
  getCarnetSettingsRepository,
  type CarnetSettingsRepository,
} from '../repository/carnet-settings.repository'
import type { ExportAnimal } from '@/shared/domain/carnet-data'
import {
  buildImportPlan,
  type ImportFile,
  type ImportMode,
  type ImportRefusalReason,
  type PlannedWrite,
} from '@/shared/domain/import-plan'

export type { ImportFile, ImportMode }

/** Incohérence que seule la base locale révèle : réessayer le même fichier n'y changerait rien. */
export type ImportRefusal = ImportRefusalReason

export class ImportRefusedError extends Error {
  constructor(readonly reason: ImportRefusal) {
    super(reason)
    this.name = 'ImportRefusedError'
  }
}

type Provider<T> = () => T | Promise<T>

type SqlStatement = ReturnType<AnimalsRepository['markAllDeletedStatement']>

type ImportMethods = 'listVersions' | 'markAllDeletedStatement' | 'restoreStatement'

type EventImportMethods = ImportMethods | 'reviveStatement'

export type DataImportDependencies = {
  carnetSettings: Provider<
    Pick<CarnetSettingsRepository, 'getVersion' | 'markDeletedStatement' | 'restoreStatement'>
  >
  animals: Provider<Pick<AnimalsRepository, 'list' | 'runImport' | ImportMethods>>
  vaccinations: Provider<Pick<VaccinationsRepository, ImportMethods>>
  vaccinationInjections: Provider<Pick<VaccinationInjectionsRepository, EventImportMethods>>
  treatments: Provider<Pick<TreatmentsRepository, ImportMethods>>
  treatmentPeriods: Provider<Pick<TreatmentPeriodsRepository, EventImportMethods>>
  treatmentDoses: Provider<Pick<TreatmentDosesRepository, EventImportMethods>>
  weight: Provider<Pick<WeightRepository, ImportMethods>>
  devices: Provider<Pick<DeviceRepository, 'listVersions' | 'restoreStatement'>>
  deviceId: () => string
  photoExists: (fileName: string) => Promise<boolean>
  syncReminders: () => Promise<void>
  now: () => Date
}

export function createDataImportService({
  carnetSettings,
  animals,
  vaccinations,
  vaccinationInjections,
  treatments,
  treatmentPeriods,
  treatmentDoses,
  weight,
  devices,
  deviceId,
  photoExists,
  syncReminders,
  now,
}: DataImportDependencies) {
  async function devicePhotos(fileAnimals: ExportAnimal[]): Promise<Set<string>> {
    const names = [
      ...new Set(
        fileAnimals.flatMap(({ photoFileName }) => (photoFileName === null ? [] : [photoFileName])),
      ),
    ]
    const found = await Promise.all(names.map((name) => photoExists(name)))
    return new Set(names.filter((_, index) => found[index]))
  }

  return {
    async hasLocalData(): Promise<boolean> {
      return (await (await animals()).list()).length > 0
    },

    /**
     * Tout ou rien : le plan (`buildImportPlan`) est arrêté avant la moindre écriture, puis joué
     * en une transaction. Lève si le plan refuse le fichier, ou si l'écriture échoue.
     */
    async importData(file: ImportFile, mode: ImportMode): Promise<void> {
      const { data } = file
      const [
        settingsRepository,
        animalsRepository,
        vaccinationsRepository,
        injectionsRepository,
        treatmentsRepository,
        periodsRepository,
        dosesRepository,
        weightRepository,
        devicesRepository,
      ] = await Promise.all([
        carnetSettings(),
        animals(),
        vaccinations(),
        vaccinationInjections(),
        treatments(),
        treatmentPeriods(),
        treatmentDoses(),
        weight(),
        devices(),
      ])
      const [
        settingsVersion,
        animalVersions,
        vaccinationVersions,
        injectionVersions,
        treatmentVersions,
        periodVersions,
        doseVersions,
        weightVersions,
        deviceVersions,
        photosOnDevice,
      ] = await Promise.all([
        settingsRepository.getVersion(),
        animalsRepository.listVersions(),
        vaccinationsRepository.listVersions(),
        injectionsRepository.listVersions(),
        treatmentsRepository.listVersions(),
        periodsRepository.listVersions(),
        dosesRepository.listVersions(),
        weightRepository.listVersions(),
        devicesRepository.listVersions(),
        devicePhotos(data.animals),
      ])

      const importedAt = now().toISOString()
      const result = buildImportPlan({
        file,
        mode,
        local: {
          carnetSettings: settingsVersion,
          animals: animalVersions,
          vaccinations: vaccinationVersions,
          vaccinationInjections: injectionVersions,
          treatments: treatmentVersions,
          treatmentPeriods: periodVersions,
          treatmentDoses: doseVersions,
          weightEntries: weightVersions,
          devices: deviceVersions,
        },
        photosOnDevice,
        importedAt,
        deviceId: deviceId(),
      })

      if (!result.ok) throw new ImportRefusedError(result.refused.reason)

      const { plan } = result
      const write = <T>(
        writes: PlannedWrite<T>[],
        restoreStatement: (row: T, exists: boolean) => SqlStatement,
      ): SqlStatement[] => writes.map(({ row, exists }) => restoreStatement(row, exists))

      await animalsRepository.runImport([
        ...(plan.replaceLocalData
          ? [
              settingsRepository.markDeletedStatement(importedAt),
              animalsRepository.markAllDeletedStatement(importedAt),
              vaccinationsRepository.markAllDeletedStatement(importedAt),
              injectionsRepository.markAllDeletedStatement(importedAt),
              treatmentsRepository.markAllDeletedStatement(importedAt),
              periodsRepository.markAllDeletedStatement(importedAt),
              dosesRepository.markAllDeletedStatement(importedAt),
              weightRepository.markAllDeletedStatement(importedAt),
            ]
          : []),
        ...(plan.carnetSettings ? [settingsRepository.restoreStatement(plan.carnetSettings)] : []),
        ...write(plan.animals, animalsRepository.restoreStatement),
        ...write(plan.vaccinations, vaccinationsRepository.restoreStatement),
        ...write(plan.vaccinationInjections, injectionsRepository.restoreStatement),
        ...plan.revivedInjections.map((id) => injectionsRepository.reviveStatement(id, importedAt)),
        ...write(plan.treatments, treatmentsRepository.restoreStatement),
        ...write(plan.treatmentPeriods, periodsRepository.restoreStatement),
        ...plan.revivedPeriods.map((id) => periodsRepository.reviveStatement(id, importedAt)),
        ...write(plan.treatmentDoses, dosesRepository.restoreStatement),
        ...plan.revivedDoses.map((id) => dosesRepository.reviveStatement(id, importedAt)),
        ...write(plan.weightEntries, weightRepository.restoreStatement),
        ...write(plan.devices, devicesRepository.restoreStatement),
      ])
      await syncReminders()
    },
  }
}

export type DataImportService = ReturnType<typeof createDataImportService>

export const dataImportService = createDataImportService({
  carnetSettings: getCarnetSettingsRepository,
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  vaccinationInjections: getVaccinationInjectionsRepository,
  treatments: getTreatmentsRepository,
  treatmentPeriods: getTreatmentPeriodsRepository,
  treatmentDoses: getTreatmentDosesRepository,
  weight: getWeightRepository,
  devices: getDeviceRepository,
  deviceId: currentDeviceId,
  photoExists,
  syncReminders: syncAllReminders,
  now: () => new Date(),
})
