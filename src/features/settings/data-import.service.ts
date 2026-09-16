import { z } from 'zod'

import { syncAllReminders } from '@/app/reminders-sync'
import { photoExists } from '@/core/photos/photo-storage'
import { animalInputSchema, animalSpeciesSchema } from '@/features/animals/animal.schema'
import { getAnimalsRepository, type AnimalsRepository } from '@/features/animals/animals.repository'
import { treatmentInputSchema, treatmentTypeSchema } from '@/features/treatments/treatment.schema'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/treatments.repository'
import { vaccinationInputSchema } from '@/features/vaccinations/vaccination.schema'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import { weightEntryInputSchema } from '@/features/weight/weight.schema'
import { getWeightRepository, type WeightRepository } from '@/features/weight/weight.repository'
import { EXPORT_SCHEMA_VERSION } from './export-format'
import type { ExportAnimal, ExportData } from '@/shared/carnet-data'
import { buildImportPlan, type ImportMode, type PlannedWrite } from '@/shared/import-plan'

export type { ImportMode }

export type ImportFileError = 'invalid' | 'newer' | 'outOfRange'

/** Incohérence que seule la base locale révèle : réessayer le même fichier n'y changerait rien. */
export type ImportRefusal = 'reattached'

export class ImportRefusedError extends Error {
  constructor(readonly reason: ImportRefusal) {
    super(reason)
    this.name = 'ImportRefusedError'
  }
}

export type ParsedExportFile =
  { ok: true; data: ExportData } | { ok: false; reason: ImportFileError }

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_LENGTH = 200

const instant = z.iso.datetime()
const timestamps = { createdAt: instant, updatedAt: instant }
const optionalText = z
  .string()
  .trim()
  .max(MAX_TEXT_LENGTH)
  .nullable()
  .transform((value) => value || null)

const animalFileSchema = z.object({
  id: z.uuid(),
  name: animalInputSchema.shape.name.max(MAX_TEXT_LENGTH),
  species: animalSpeciesSchema,
  breed: optionalText,
  birthDate: animalInputSchema.shape.birthDate,
  initialWeightKg: animalInputSchema.shape.initialWeightKg,
  photoFileName: z.string().max(MAX_TEXT_LENGTH).nullable(),
  ...timestamps,
})

const vaccinationFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: vaccinationInputSchema.shape.name.max(MAX_TEXT_LENGTH),
  lastInjectionDate: vaccinationInputSchema.shape.lastInjectionDate,
  dueDate: z.iso.date().nullable(),
  ...timestamps,
})

const treatmentFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: treatmentInputSchema.shape.name.max(MAX_TEXT_LENGTH),
  type: treatmentTypeSchema,
  frequency: treatmentInputSchema.shape.frequency,
  lastDoseDate: treatmentInputSchema.shape.lastDoseDate,
  nextDueDate: z.iso.date(),
  ...timestamps,
})

const weightEntryFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  weightKg: weightEntryInputSchema.shape.weightKg,
  measuredOn: weightEntryInputSchema.shape.measuredOn,
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
    animals: z.array(animalFileSchema),
    vaccinations: z.array(vaccinationFileSchema),
    treatments: z.array(treatmentFileSchema),
    weightEntries: z.array(weightEntryFileSchema),
  })
  .refine((file) =>
    [file.animals, file.vaccinations, file.treatments, file.weightEntries].every(hasUniqueIds),
  )
  .refine((file) => {
    const animalIds = new Set(file.animals.map((animal) => animal.id))
    return [...file.vaccinations, ...file.treatments, ...file.weightEntries].every((row) =>
      animalIds.has(row.animalId),
    )
  })

const versionSchema = z.object({ schemaVersion: z.number().int().positive() })

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const BOUNDED_FIELDS = [['weightKg'], ['initialWeightKg'], ['frequency', 'value']]

function endsWith(path: PropertyKey[], suffix: string[]): boolean {
  return suffix.every((segment, index) => path[path.length - suffix.length + index] === segment)
}

function refusalReason(error: z.ZodError): ImportFileError {
  const onlyBoundsExceeded = error.issues.every(
    (issue) =>
      issue.code === 'too_big' && BOUNDED_FIELDS.some((suffix) => endsWith(issue.path, suffix)),
  )

  return onlyBoundsExceeded ? 'outOfRange' : 'invalid'
}

export function parseExportFile(text: string): ParsedExportFile {
  const document = parseJson(text)

  const version = versionSchema.safeParse(document)
  if (!version.success) return { ok: false, reason: 'invalid' }
  if (version.data.schemaVersion > EXPORT_SCHEMA_VERSION) return { ok: false, reason: 'newer' }

  const file = exportFileSchema.safeParse(document)
  if (!file.success) return { ok: false, reason: refusalReason(file.error) }

  const { animals, vaccinations, treatments, weightEntries } = file.data
  return { ok: true, data: { animals, vaccinations, treatments, weightEntries } }
}

type Provider<T> = () => T | Promise<T>

type SqlStatement = ReturnType<AnimalsRepository['markAllDeletedStatement']>

type ImportMethods = 'listVersions' | 'markAllDeletedStatement' | 'restoreStatement'

export type DataImportDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list' | 'runImport' | ImportMethods>>
  vaccinations: Provider<Pick<VaccinationsRepository, ImportMethods>>
  treatments: Provider<Pick<TreatmentsRepository, ImportMethods>>
  weight: Provider<Pick<WeightRepository, ImportMethods>>
  photoExists: (fileName: string) => Promise<boolean>
  syncReminders: () => Promise<void>
  now: () => Date
}

export function createDataImportService({
  animals,
  vaccinations,
  treatments,
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
     * en une transaction. Lève si le fichier déplace une entrée d'un animal à l'autre, ou si
     * l'écriture échoue.
     */
    async importData(data: ExportData, mode: ImportMode): Promise<void> {
      const [animalsRepository, vaccinationsRepository, treatmentsRepository, weightRepository] =
        await Promise.all([animals(), vaccinations(), treatments(), weight()])
      const [
        [animalVersions, vaccinationVersions, treatmentVersions, weightVersions],
        photosOnDevice,
      ] = await Promise.all([
        Promise.all([
          animalsRepository.listVersions(),
          vaccinationsRepository.listVersions(),
          treatmentsRepository.listVersions(),
          weightRepository.listVersions(),
        ]),
        devicePhotos(data.animals),
      ])

      const importedAt = now().toISOString()
      const result = buildImportPlan({
        data,
        mode,
        local: {
          animals: animalVersions,
          vaccinations: vaccinationVersions,
          treatments: treatmentVersions,
          weightEntries: weightVersions,
        },
        photosOnDevice,
        importedAt,
      })

      if (!result.ok) throw new ImportRefusedError('reattached')

      const { plan } = result
      const write = <T>(
        writes: PlannedWrite<T>[],
        restoreStatement: (row: T, exists: boolean) => SqlStatement,
      ): SqlStatement[] => writes.map(({ row, exists }) => restoreStatement(row, exists))

      await animalsRepository.runImport([
        ...(plan.replaceLocalData
          ? [
              animalsRepository.markAllDeletedStatement(importedAt),
              vaccinationsRepository.markAllDeletedStatement(importedAt),
              treatmentsRepository.markAllDeletedStatement(importedAt),
              weightRepository.markAllDeletedStatement(importedAt),
            ]
          : []),
        ...write(plan.animals, animalsRepository.restoreStatement),
        ...write(plan.vaccinations, vaccinationsRepository.restoreStatement),
        ...write(plan.treatments, treatmentsRepository.restoreStatement),
        ...write(plan.weightEntries, weightRepository.restoreStatement),
      ])
      await syncReminders()
    },
  }
}

export type DataImportService = ReturnType<typeof createDataImportService>

export const dataImportService = createDataImportService({
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  treatments: getTreatmentsRepository,
  weight: getWeightRepository,
  photoExists,
  syncReminders: syncAllReminders,
  now: () => new Date(),
})
