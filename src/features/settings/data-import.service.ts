import { z } from 'zod'

import { syncAllReminders } from '@/app/reminders-sync'
import { photoDisplayUrl } from '@/core/photos/photo-storage'
import { animalInputSchema, animalSpeciesSchema } from '@/features/animals/animal.schema'
import {
  getAnimalsRepository,
  type AnimalsRepository,
  type AnimalVersion,
} from '@/features/animals/animals.repository'
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
import { EXPORT_SCHEMA_VERSION, type ExportAnimal, type ExportData } from './export-format'

export type ImportFileError = 'invalid' | 'newer' | 'outOfRange'

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

const WEIGHT_FIELDS = new Set(['weightKg', 'initialWeightKg'])

function refusalReason(error: z.ZodError): ImportFileError {
  const onlyWeightsTooBig = error.issues.every(
    (issue) => issue.code === 'too_big' && WEIGHT_FIELDS.has(String(issue.path.at(-1))),
  )

  return onlyWeightsTooBig ? 'outOfRange' : 'invalid'
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

export type ImportMode = 'merge' | 'replace'

type SqlStatement = ReturnType<AnimalsRepository['markAllDeletedStatement']>

type ImportMethods = 'listVersions' | 'markAllDeletedStatement' | 'restoreStatement'

type Stamped = { id: string; updatedAt: string }
type Versioned = Stamped & { deletedAt: string | null }

export type DataImportDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list' | 'runImport' | ImportMethods>>
  vaccinations: Provider<Pick<VaccinationsRepository, ImportMethods>>
  treatments: Provider<Pick<TreatmentsRepository, ImportMethods>>
  weight: Provider<Pick<WeightRepository, ImportMethods>>
  photoExists: (fileName: string) => Promise<boolean>
  syncReminders: () => Promise<void>
  now: () => Date
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
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
  return {
    async hasLocalData(): Promise<boolean> {
      return (await (await animals()).list()).length > 0
    },

    /**
     * Tout ou rien, en une transaction. `merge` : la version la plus récente (`updatedAt`) d'une
     * même entrée gagne, suppression locale comprise. `replace` : les données locales sont
     * marquées supprimées, celles du fichier écrites. Une entrée déjà en base prend la date de
     * l'import, une nouvelle garde les siennes. Lève si l'écriture échoue.
     */
    async importData(data: ExportData, mode: ImportMode): Promise<void> {
      const [animalsRepository, vaccinationsRepository, treatmentsRepository, weightRepository] =
        await Promise.all([animals(), vaccinations(), treatments(), weight()])
      const [animalVersions, vaccinationVersions, treatmentVersions, weightVersions] =
        await Promise.all([
          animalsRepository.listVersions(),
          vaccinationsRepository.listVersions(),
          treatmentsRepository.listVersions(),
          weightRepository.listVersions(),
        ])

      const replace = mode === 'replace'
      const importedAt = now().toISOString()
      const wins = (incoming: Stamped, local: Stamped | undefined) =>
        replace ||
        local === undefined ||
        Date.parse(incoming.updatedAt) > Date.parse(local.updatedAt)
      const dated = <T extends Stamped>(row: T, local: Stamped | undefined): T =>
        local === undefined ? row : { ...row, updatedAt: importedAt }

      const statements: SqlStatement[] = replace
        ? [
            animalsRepository.markAllDeletedStatement(importedAt),
            vaccinationsRepository.markAllDeletedStatement(importedAt),
            treatmentsRepository.markAllDeletedStatement(importedAt),
            weightRepository.markAllDeletedStatement(importedAt),
          ]
        : []

      const localAnimals = byId(animalVersions)
      const photoOwners = new Map(
        animalVersions.flatMap(({ id, photoPath }) =>
          photoPath === null ? [] : [[photoPath, id] as const],
        ),
      )

      /** Les photos ne voyagent pas dans l'export : l'import n'en retire jamais une déjà sur l'appareil. */
      async function resolvePhoto(animal: ExportAnimal, local: AnimalVersion | undefined) {
        const name = animal.photoFileName
        const owner = name === null ? undefined : photoOwners.get(name)
        if (name !== null && (owner ?? animal.id) === animal.id && (await photoExists(name))) {
          photoOwners.set(name, animal.id)
          return name
        }
        return local?.photoPath ?? null
      }

      const visibleAnimalIds = new Set<string>()
      /** Animal supprimé que le fichier rend visible : son carnet, marqué à la même date, revient avec lui. */
      const revivedCascades = new Map<string, string>()
      for (const animal of data.animals) {
        const local = localAnimals.get(animal.id)
        if (wins(animal, local)) {
          const { photoFileName: _, ...fields } = animal
          const photoPath = await resolvePhoto(animal, local)
          statements.push(
            animalsRepository.restoreStatement(
              dated({ ...fields, photoPath }, local),
              local !== undefined,
            ),
          )
          visibleAnimalIds.add(animal.id)
          if (local?.deletedAt) revivedCascades.set(animal.id, local.deletedAt)
        } else if (local?.deletedAt === null) {
          visibleAnimalIds.add(animal.id)
        }
      }

      function restoreRecords<T extends Stamped & { animalId: string }>(
        rows: T[],
        versions: Versioned[],
        restoreStatement: (row: T, exists: boolean) => SqlStatement,
      ): void {
        const local = byId(versions)
        for (const row of rows) {
          if (!visibleAnimalIds.has(row.animalId)) continue
          const existing = local.get(row.id)
          const revived =
            existing !== undefined &&
            existing.deletedAt !== null &&
            existing.deletedAt === revivedCascades.get(row.animalId)
          if (wins(row, existing) || revived) {
            statements.push(restoreStatement(dated(row, existing), existing !== undefined))
          }
        }
      }

      restoreRecords(
        data.vaccinations,
        vaccinationVersions,
        vaccinationsRepository.restoreStatement,
      )
      restoreRecords(data.treatments, treatmentVersions, treatmentsRepository.restoreStatement)
      restoreRecords(data.weightEntries, weightVersions, weightRepository.restoreStatement)

      await animalsRepository.runImport(statements)
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
  photoExists: (fileName) =>
    photoDisplayUrl(fileName).then(
      () => true,
      () => false,
    ),
  syncReminders: syncAllReminders,
  now: () => new Date(),
})
