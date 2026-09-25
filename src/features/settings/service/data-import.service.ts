import { z } from 'zod'

import { syncAllReminders } from '@/app/reminders-sync'
import { photoExists } from '@/core/photos/photo-storage'
import { animalInputSchema, animalSpeciesSchema } from '@/features/animals/schema/animal.schema'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import {
  treatmentInputSchema,
  treatmentTypeSchema,
} from '@/features/treatments/schema/treatment.schema'
import {
  getTreatmentDosesRepository,
  type TreatmentDosesRepository,
} from '@/features/treatments/repository/treatment-doses.repository'
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
import { fromExportV1 } from '../logic/export-v1'
import { exportFileV1Schema } from '../schema/export-v1.schema'
import type { ExportAnimal } from '@/shared/domain/carnet-data'
import {
  buildImportPlan,
  type ImportFile,
  type ImportMode,
  type ImportRefusalReason,
  type PlannedWrite,
} from '@/shared/domain/import-plan'

export type { ImportFile, ImportMode }

export type ImportFileError = 'invalid' | 'newer' | 'outOfRange'

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
  ...timestamps,
})

const injectionFileSchema = z.object({
  id: z.uuid(),
  vaccinationId: z.uuid(),
  animalId: z.uuid(),
  injectedOn: vaccinationInputSchema.shape.lastInjectionDate,
  nextDueDate: z.iso.date().nullable(),
  ...timestamps,
})

const treatmentFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: treatmentInputSchema.shape.name.max(MAX_TEXT_LENGTH),
  type: treatmentTypeSchema,
  frequency: treatmentInputSchema.shape.frequency,
  stoppedOn: z.iso.date().nullable(),
  ...timestamps,
})

const doseFileSchema = z.object({
  id: z.uuid(),
  treatmentId: z.uuid(),
  animalId: z.uuid(),
  givenOn: treatmentInputSchema.shape.lastDoseDate,
  nextDueDate: z.iso.date(),
  frequency: treatmentInputSchema.shape.frequency,
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
    vaccinationInjections: z.array(injectionFileSchema),
    treatments: z.array(treatmentFileSchema),
    treatmentDoses: z.array(doseFileSchema),
    weightEntries: z.array(weightEntryFileSchema),
  })
  .refine((file) =>
    [
      file.animals,
      file.vaccinations,
      file.vaccinationInjections,
      file.treatments,
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
      ...file.treatmentDoses,
      ...file.weightEntries,
    ].every((row) => animalIds.has(row.animalId))
  })
  .refine((file) => {
    const injected = new Set(file.vaccinationInjections.map(({ vaccinationId }) => vaccinationId))
    const dosed = new Set(file.treatmentDoses.map(({ treatmentId }) => treatmentId))
    return (
      file.vaccinations.every(({ id }) => injected.has(id)) &&
      file.treatments.every(({ id }) => dosed.has(id))
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

/** La version aiguille avant toute validation : chaque format se relit avec son propre schéma. */
export function parseExportFile(text: string): ParsedExportFile {
  const document = parseJson(text)

  const version = versionSchema.safeParse(document)
  if (!version.success) return { ok: false, reason: 'invalid' }
  if (version.data.schemaVersion > EXPORT_SCHEMA_VERSION) return { ok: false, reason: 'newer' }

  if (version.data.schemaVersion === 1) {
    const file = exportFileV1Schema.safeParse(document)
    if (!file.success) return { ok: false, reason: refusalReason(file.error) }
    return { ok: true, file: { schemaVersion: 1, data: fromExportV1(file.data) } }
  }

  const file = exportFileSchema.safeParse(document)
  if (!file.success) return { ok: false, reason: refusalReason(file.error) }

  const {
    animals,
    vaccinations,
    vaccinationInjections,
    treatments,
    treatmentDoses,
    weightEntries,
  } = file.data
  return {
    ok: true,
    file: {
      schemaVersion: 2,
      data: {
        animals,
        vaccinations,
        vaccinationInjections,
        treatments,
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
  animals: Provider<Pick<AnimalsRepository, 'list' | 'runImport' | ImportMethods>>
  vaccinations: Provider<Pick<VaccinationsRepository, ImportMethods>>
  vaccinationInjections: Provider<Pick<VaccinationInjectionsRepository, EventImportMethods>>
  treatments: Provider<Pick<TreatmentsRepository, ImportMethods>>
  treatmentDoses: Provider<
    Pick<TreatmentDosesRepository, EventImportMethods | 'reconcileStaleHeadsStatement'>
  >
  weight: Provider<Pick<WeightRepository, ImportMethods>>
  photoExists: (fileName: string) => Promise<boolean>
  syncReminders: () => Promise<void>
  now: () => Date
}

export function createDataImportService({
  animals,
  vaccinations,
  vaccinationInjections,
  treatments,
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
     * en une transaction, avec la réconciliation des prises à fréquence périmée. Lève si le plan
     * refuse le fichier, ou si l'écriture échoue.
     */
    async importData(file: ImportFile, mode: ImportMode): Promise<void> {
      const { data } = file
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
      const [
        [
          animalVersions,
          vaccinationVersions,
          injectionVersions,
          treatmentVersions,
          doseVersions,
          weightVersions,
        ],
        photosOnDevice,
      ] = await Promise.all([
        Promise.all([
          animalsRepository.listVersions(),
          vaccinationsRepository.listVersions(),
          injectionsRepository.listVersions(),
          treatmentsRepository.listVersions(),
          dosesRepository.listVersions(),
          weightRepository.listVersions(),
        ]),
        devicePhotos(data.animals),
      ])

      const importedAt = now().toISOString()
      const result = buildImportPlan({
        file,
        mode,
        local: {
          animals: animalVersions,
          vaccinations: vaccinationVersions,
          vaccinationInjections: injectionVersions,
          treatments: treatmentVersions,
          treatmentDoses: doseVersions,
          weightEntries: weightVersions,
        },
        photosOnDevice,
        importedAt,
        newId: () => crypto.randomUUID(),
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
              animalsRepository.markAllDeletedStatement(importedAt),
              vaccinationsRepository.markAllDeletedStatement(importedAt),
              injectionsRepository.markAllDeletedStatement(importedAt),
              treatmentsRepository.markAllDeletedStatement(importedAt),
              dosesRepository.markAllDeletedStatement(importedAt),
              weightRepository.markAllDeletedStatement(importedAt),
            ]
          : []),
        ...write(plan.animals, animalsRepository.restoreStatement),
        ...write(plan.vaccinations, vaccinationsRepository.restoreStatement),
        ...write(plan.vaccinationInjections, injectionsRepository.restoreStatement),
        ...plan.revivedInjections.map((id) => injectionsRepository.reviveStatement(id, importedAt)),
        ...write(plan.treatments, treatmentsRepository.restoreStatement),
        ...write(plan.treatmentDoses, dosesRepository.restoreStatement),
        ...plan.revivedDoses.map((id) => dosesRepository.reviveStatement(id, importedAt)),
        ...write(plan.weightEntries, weightRepository.restoreStatement),
        dosesRepository.reconcileStaleHeadsStatement(importedAt),
      ])
      await syncReminders()
    },
  }
}

export type DataImportService = ReturnType<typeof createDataImportService>

export const dataImportService = createDataImportService({
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  vaccinationInjections: getVaccinationInjectionsRepository,
  treatments: getTreatmentsRepository,
  treatmentDoses: getTreatmentDosesRepository,
  weight: getWeightRepository,
  photoExists,
  syncReminders: syncAllReminders,
  now: () => new Date(),
})
