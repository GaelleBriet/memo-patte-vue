import { getDeviceRepository, type DeviceRepository } from '@/core/device/device.repository'
import i18n, { currentLocale, type AppLocale } from '@/core/i18n'
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
  deliverExportFile,
  type DeliveryMode,
  type DeliveryOutcome,
} from '../logic/export-delivery'
import {
  getCarnetSettingsRepository,
  type CarnetSettingsRepository,
} from '../repository/carnet-settings.repository'
import { buildExportFile, type ExportFile, type ExportFormat } from '../logic/export-format'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { WeightUnit } from '@/shared/domain/weight-unit'
import { currentWeightUnit } from '@/shared/domain/weight-unit-preference'

type Provider<T> = () => T | Promise<T>

export type DataExportDependencies = {
  carnetSettings: Provider<Pick<CarnetSettingsRepository, 'getRecord'>>
  animals: Provider<Pick<AnimalsRepository, 'listRecords'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listRecords'>>
  vaccinationInjections: Provider<Pick<VaccinationInjectionsRepository, 'listAll'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listRecords'>>
  treatmentPeriods: Provider<Pick<TreatmentPeriodsRepository, 'listRecords'>>
  treatmentDoses: Provider<Pick<TreatmentDosesRepository, 'listRecords'>>
  weight: Provider<Pick<WeightRepository, 'listRecords'>>
  devices: Provider<Pick<DeviceRepository, 'listRecords'>>
  deliver: (file: ExportFile, mode: DeliveryMode) => Promise<DeliveryOutcome>
  now: () => Date
  appVersion: string
  weightUnit: () => WeightUnit
  locale: () => AppLocale
}

// Une ligne exportée sans son parent ferait refuser le fichier à l'import.
function childrenOf<E>(parents: { id: string }[], rows: E[], parentOf: (row: E) => string): E[] {
  const byParent = new Map<string, E[]>()
  for (const row of rows) {
    const siblings = byParent.get(parentOf(row))
    if (siblings) siblings.push(row)
    else byParent.set(parentOf(row), [row])
  }
  return parents.flatMap(({ id }) => byParent.get(id) ?? [])
}

export function createDataExportService({
  carnetSettings,
  animals,
  vaccinations,
  vaccinationInjections,
  treatments,
  treatmentPeriods,
  treatmentDoses,
  weight,
  devices,
  deliver,
  now,
  appVersion,
  weightUnit,
  locale,
}: DataExportDependencies) {
  async function collect(): Promise<ExportData> {
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
      settings,
      animalRows,
      vaccinationRows,
      injectionRows,
      treatmentRows,
      allPeriods,
      allDoses,
      allWeights,
      deviceRows,
    ] = await Promise.all([
      settingsRepository.getRecord(),
      animalsRepository.listRecords(),
      vaccinationsRepository.listRecords(),
      injectionsRepository.listAll(),
      treatmentsRepository.listRecords(),
      periodsRepository.listRecords(),
      dosesRepository.listRecords(),
      weightRepository.listRecords(),
      devicesRepository.listRecords(),
    ])
    const weightRows = childrenOf(animalRows, allWeights, ({ animalId }) => animalId)
    const periodRows = childrenOf(treatmentRows, allPeriods, ({ treatmentId }) => treatmentId)
    const exportedPeriods = new Set(periodRows.map(({ id }) => id))
    const doseRows = childrenOf(treatmentRows, allDoses, ({ treatmentId }) => treatmentId).filter(
      ({ periodId }) => exportedPeriods.has(periodId),
    )

    return {
      carnetSettings: settings && {
        vaccineReminderTime: settings.vaccineReminderTime,
        remindBeforeDue: settings.remindBeforeDue,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
        createdByDevice: settings.createdByDevice,
        updatedByDevice: settings.updatedByDevice,
      },
      animals: animalRows.map((animal) => ({
        id: animal.id,
        name: animal.name,
        species: animal.species,
        breed: animal.breed,
        birthDate: animal.birthDate,
        birthDateApproximate: animal.birthDateApproximate,
        photoFileName: animal.photoPath,
        unfollowedOn: animal.unfollowedOn,
        departureReason: animal.departureReason,
        departureDate: animal.departureDate,
        createdAt: animal.createdAt,
        updatedAt: animal.updatedAt,
        createdByDevice: animal.createdByDevice,
        updatedByDevice: animal.updatedByDevice,
      })),
      vaccinations: vaccinationRows.map((vaccination) => ({
        id: vaccination.id,
        animalId: vaccination.animalId,
        name: vaccination.name,
        plannedDueDate: vaccination.plannedDueDate,
        createdAt: vaccination.createdAt,
        updatedAt: vaccination.updatedAt,
        createdByDevice: vaccination.createdByDevice,
        updatedByDevice: vaccination.updatedByDevice,
      })),
      vaccinationInjections: childrenOf(
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
        createdByDevice: injection.createdByDevice,
        updatedByDevice: injection.updatedByDevice,
      })),
      treatments: treatmentRows.map((treatment) => ({
        id: treatment.id,
        animalId: treatment.animalId,
        name: treatment.name,
        type: treatment.type,
        createdAt: treatment.createdAt,
        updatedAt: treatment.updatedAt,
        createdByDevice: treatment.createdByDevice,
        updatedByDevice: treatment.updatedByDevice,
      })),
      treatmentPeriods: periodRows.map((period) => ({
        id: period.id,
        treatmentId: period.treatmentId,
        animalId: period.animalId,
        startsOn: period.startsOn,
        firstDueOn: period.firstDueOn,
        referenceOn: period.referenceOn,
        endsOn: period.endsOn,
        stoppedOn: period.stoppedOn,
        frequency: { value: period.frequency.value, unit: period.frequency.unit },
        times: [...period.times],
        doseQuantity: period.doseQuantity,
        doseUnit: period.doseUnit,
        reminderOffsetMinutes: period.reminderOffsetMinutes,
        reminderTime: period.reminderTime,
        createdAt: period.createdAt,
        updatedAt: period.updatedAt,
        createdByDevice: period.createdByDevice,
        updatedByDevice: period.updatedByDevice,
      })),
      treatmentDoses: doseRows.map((dose) => ({
        id: dose.id,
        periodId: dose.periodId,
        treatmentId: dose.treatmentId,
        animalId: dose.animalId,
        dueOn: dose.dueOn,
        dueTime: dose.dueTime,
        givenOn: dose.givenOn,
        status: dose.status,
        nextDueDate: dose.nextDueDate,
        createdAt: dose.createdAt,
        updatedAt: dose.updatedAt,
        createdByDevice: dose.createdByDevice,
        updatedByDevice: dose.updatedByDevice,
      })),
      weightEntries: weightRows.map((entry) => ({
        id: entry.id,
        animalId: entry.animalId,
        weightKg: entry.weightKg,
        measuredOn: entry.measuredOn,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        createdByDevice: entry.createdByDevice,
        updatedByDevice: entry.updatedByDevice,
      })),
      devices: deviceRows.map((device) => ({
        id: device.id,
        model: device.model,
        installedAt: device.installedAt,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      })),
    }
  }

  return {
    collect,

    /** Lit la base locale seulement ; lève si la lecture ou l'écriture du fichier échoue. */
    async exportData(format: ExportFormat, mode: DeliveryMode): Promise<DeliveryOutcome> {
      const data = await collect()
      const meta = { exportedAt: now(), appVersion }
      return deliver(buildExportFile(format, data, meta, weightUnit(), locale()), mode)
    },
  }
}

export type DataExportService = ReturnType<typeof createDataExportService>

export const dataExportService = createDataExportService({
  carnetSettings: getCarnetSettingsRepository,
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  vaccinationInjections: getVaccinationInjectionsRepository,
  treatments: getTreatmentsRepository,
  treatmentPeriods: getTreatmentPeriodsRepository,
  treatmentDoses: getTreatmentDosesRepository,
  weight: getWeightRepository,
  devices: getDeviceRepository,
  deliver: (file, mode) =>
    deliverExportFile(file, mode, i18n.global.t('settings.export.shareTitle')),
  now: () => new Date(),
  appVersion: import.meta.env.VITE_APP_VERSION,
  weightUnit: currentWeightUnit,
  locale: currentLocale,
})
