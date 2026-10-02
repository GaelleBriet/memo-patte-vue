import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

import { syncAllReminders } from '@/app/reminders-sync'
import { isPhotoFileName, photoExists } from '@/core/photos/photo-storage'
import {
  animalInputSchema,
  animalSpeciesSchema,
  departureReasonSchema,
} from '@/features/animals/schema/animal.schema'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import { DOSE_STATUSES } from '@/features/treatments/schema/treatment-dose.schema'
import {
  doseUnitSchema,
  REMINDER_OFFSETS_MINUTES,
} from '@/features/treatments/schema/treatment-period.schema'
import {
  treatmentFrequencySchema,
  treatmentInputSchema,
  treatmentTypeSchema,
} from '@/features/treatments/schema/treatment.schema'
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
import { vaccinationInputSchema } from '@/features/vaccinations/schema/vaccination.schema'
import {
  getVaccinationInjectionsRepository,
  type VaccinationInjectionsRepository,
} from '@/features/vaccinations/repository/vaccination-injections.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import { weightEntryInputSchema } from '@/features/weight/schema/weight.schema'
import {
  getWeightRepository,
  type WeightRepository,
} from '@/features/weight/repository/weight.repository'
import { EXPORT_SCHEMA_VERSION } from '../logic/export-format'
import {
  getCarnetSettingsRepository,
  type CarnetSettingsRepository,
} from '../repository/carnet-settings.repository'
import { carnetSettingsSchema } from '../schema/carnet-settings.schema'
import { isCalendarDay, MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR } from '@/shared/domain/calendar-day'
import type { ExportAnimal } from '@/shared/domain/carnet-data'
import { CLOCK_TIME_PATTERN } from '@/shared/domain/clock-time'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'
import {
  buildImportPlan,
  type ImportFile,
  type ImportMode,
  type ImportRefusalReason,
  type PlannedWrite,
} from '@/shared/domain/import-plan'

export type { ImportFile, ImportMode }

export type ImportFileError = 'invalid' | 'newer' | 'older' | 'outOfRange' | 'nameTooLong'

/** Incohérence que seule la base locale révèle : réessayer le même fichier n'y changerait rien. */
export type ImportRefusal = ImportRefusalReason

export class ImportRefusedError extends Error {
  constructor(readonly reason: ImportRefusal) {
    super(reason)
    this.name = 'ImportRefusedError'
  }
}

export type ParsedExportFile =
  { ok: true; file: ImportFile } | { ok: false; reason: ImportFileError }

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_LENGTH = 200
const MAX_TIMES_PER_DAY = 24

function isYearInRange(value: string): boolean {
  const year = Number(value.slice(0, 4))
  return year >= MIN_CALENDAR_YEAR && year <= MAX_CALENDAR_YEAR
}

const day = z.string().refine(isCalendarDay)
const pastDay = day.refine((value) => !isFuture(parseISO(value)))
const clockTime = z.string().regex(CLOCK_TIME_PATTERN)
// La synchronisation compare les instants comme des chaînes : un seul format entre en base.
const instant = z.iso
  .datetime()
  .refine(isYearInRange)
  .transform((value) => new Date(value).toISOString())
const timestamps = { createdAt: instant, updatedAt: instant }
const optionalName = z
  .string()
  .trim()
  .max(MAX_NAME_LENGTH)
  .nullable()
  .transform((value) => value || null)

const carnetSettingsFileSchema = carnetSettingsSchema.extend(timestamps)

const animalFileSchema = z.object({
  id: z.uuid(),
  name: animalInputSchema.shape.name,
  species: animalSpeciesSchema,
  breed: optionalName,
  birthDate: pastDay.nullable(),
  birthDateApproximate: z.boolean(),
  photoFileName: z.string().max(MAX_TEXT_LENGTH).refine(isPhotoFileName).nullable(),
  unfollowedOn: day.nullable(),
  departureReason: departureReasonSchema.nullable(),
  departureDate: day.nullable(),
  ...timestamps,
})

const vaccinationFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: vaccinationInputSchema.shape.name,
  plannedDueDate: day.nullable(),
  ...timestamps,
})

const injectionFileSchema = z.object({
  id: z.uuid(),
  vaccinationId: z.uuid(),
  animalId: z.uuid(),
  injectedOn: pastDay,
  nextDueDate: day.nullable(),
  ...timestamps,
})

const treatmentFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: treatmentInputSchema.shape.name,
  type: treatmentTypeSchema,
  ...timestamps,
})

const periodFileSchema = z
  .object({
    id: z.uuid(),
    treatmentId: z.uuid(),
    animalId: z.uuid(),
    startsOn: day,
    firstDueOn: day,
    endsOn: day.nullable(),
    stoppedOn: day.nullable(),
    frequency: treatmentFrequencySchema,
    times: z
      .array(clockTime)
      .max(MAX_TIMES_PER_DAY)
      .refine((times) => new Set(times).size === times.length),
    doseQuantity: z.number().positive().nullable(),
    doseUnit: doseUnitSchema.nullable(),
    reminderOffsetMinutes: z.literal([...REMINDER_OFFSETS_MINUTES]).nullable(),
    reminderTime: clockTime.nullable(),
    ...timestamps,
  })
  .refine((period) => (period.doseQuantity === null) === (period.doseUnit === null))
  .refine(({ startsOn, firstDueOn, endsOn, stoppedOn }) =>
    [firstDueOn, endsOn, stoppedOn].every((date) => date === null || date >= startsOn),
  )

const doseFileSchema = z
  .object({
    id: z.uuid(),
    periodId: z.uuid(),
    treatmentId: z.uuid(),
    animalId: z.uuid(),
    dueOn: day,
    dueTime: clockTime.nullable(),
    givenOn: pastDay.nullable(),
    status: z.enum(DOSE_STATUSES),
    nextDueDate: day,
    ...timestamps,
  })
  .refine((dose) => (dose.status === 'given') === (dose.givenOn !== null))

const weightEntryFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  weightKg: weightEntryInputSchema.shape.weightKg,
  measuredOn: pastDay,
  ...timestamps,
})

function hasUniqueIds(rows: { id: string }[]): boolean {
  return new Set(rows.map((row) => row.id)).size === rows.length
}

const exportFileSchema = z
  .object({
    schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
    exportedAt: instant,
    appVersion: z.string().max(MAX_TEXT_LENGTH),
    carnetSettings: carnetSettingsFileSchema.nullable(),
    animals: z.array(animalFileSchema),
    vaccinations: z.array(vaccinationFileSchema),
    vaccinationInjections: z.array(injectionFileSchema),
    treatments: z.array(treatmentFileSchema),
    treatmentPeriods: z.array(periodFileSchema),
    treatmentDoses: z.array(doseFileSchema),
    weightEntries: z.array(weightEntryFileSchema),
  })
  .refine((file) =>
    [
      file.animals,
      file.vaccinations,
      file.vaccinationInjections,
      file.treatments,
      file.treatmentPeriods,
      file.treatmentDoses,
      file.weightEntries,
    ].every(hasUniqueIds),
  )
  .refine((file) => {
    const animalIds = new Set(file.animals.map((animal) => animal.id))
    return [
      ...file.vaccinations,
      ...file.vaccinationInjections,
      ...file.treatments,
      ...file.treatmentPeriods,
      ...file.treatmentDoses,
      ...file.weightEntries,
    ].every((row) => animalIds.has(row.animalId))
  })
  .refine((file) => {
    const withPeriod = new Set(file.treatmentPeriods.map(({ treatmentId }) => treatmentId))
    const withDose = new Set(file.treatmentDoses.map(({ treatmentId }) => treatmentId))
    return file.treatments.every(({ id }) => withPeriod.has(id) && withDose.has(id))
  })

const versionSchema = z.object({ schemaVersion: z.number().int().positive() })

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const BOUNDED_FIELDS = [['weightKg'], ['frequency', 'value']]
const NAME_FIELDS = [['name'], ['breed']]

function endsWith(path: PropertyKey[], suffix: string[]): boolean {
  return suffix.every((segment, index) => path[path.length - suffix.length + index] === segment)
}

function onlyTooBig(error: z.ZodError, fields: string[][]): boolean {
  return error.issues.every(
    (issue) => issue.code === 'too_big' && fields.some((suffix) => endsWith(issue.path, suffix)),
  )
}

function refusalReason(error: z.ZodError): ImportFileError {
  if (onlyTooBig(error, NAME_FIELDS)) return 'nameTooLong'
  return onlyTooBig(error, BOUNDED_FIELDS) ? 'outOfRange' : 'invalid'
}

/** La version tranche avant toute validation : seul le format courant se relit. */
export function parseExportFile(text: string): ParsedExportFile {
  const document = parseJson(text)

  const version = versionSchema.safeParse(document)
  if (!version.success) return { ok: false, reason: 'invalid' }
  if (version.data.schemaVersion > EXPORT_SCHEMA_VERSION) return { ok: false, reason: 'newer' }
  if (version.data.schemaVersion < EXPORT_SCHEMA_VERSION) return { ok: false, reason: 'older' }

  const file = exportFileSchema.safeParse(document)
  if (!file.success) return { ok: false, reason: refusalReason(file.error) }

  const {
    carnetSettings,
    animals,
    vaccinations,
    vaccinationInjections,
    treatments,
    treatmentPeriods,
    treatmentDoses,
    weightEntries,
  } = file.data
  return {
    ok: true,
    file: {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      data: {
        carnetSettings,
        animals,
        vaccinations,
        vaccinationInjections,
        treatments,
        treatmentPeriods,
        treatmentDoses,
        weightEntries,
      },
    },
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
      ] = await Promise.all([
        carnetSettings(),
        animals(),
        vaccinations(),
        vaccinationInjections(),
        treatments(),
        treatmentPeriods(),
        treatmentDoses(),
        weight(),
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
        },
        photosOnDevice,
        importedAt,
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
  photoExists,
  syncReminders: syncAllReminders,
  now: () => new Date(),
})
