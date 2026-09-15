import { z } from 'zod'

import { EXPORT_SCHEMA_VERSION, type ExportData } from './export-format'

export type ImportFileError = 'invalid' | 'newer'

export type ParsedExportFile =
  { ok: true; data: ExportData } | { ok: false; reason: ImportFileError }

const instant = z.iso.datetime({ offset: true })
const civilDate = z.iso.date()

const timestamps = { createdAt: instant, updatedAt: instant }

const animalSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  species: z.enum(['dog', 'cat']),
  breed: z.string().nullable(),
  birthDate: civilDate.nullable(),
  initialWeightKg: z.number().positive().nullable(),
  photoFileName: z.string().nullable(),
  ...timestamps,
})

const vaccinationSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: z.string().trim().min(1),
  lastInjectionDate: civilDate,
  dueDate: civilDate.nullable(),
  ...timestamps,
})

const treatmentSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: z.string().trim().min(1),
  type: z.enum(['deworming', 'antiparasitic']),
  frequency: z.object({
    value: z.number().int().positive(),
    unit: z.enum(['day', 'week', 'month']),
  }),
  lastDoseDate: civilDate,
  nextDueDate: civilDate,
  ...timestamps,
})

const weightEntrySchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  weightKg: z.number().positive(),
  measuredOn: civilDate,
  ...timestamps,
})

function hasUniqueIds(rows: { id: string }[]): boolean {
  return new Set(rows.map((row) => row.id)).size === rows.length
}

const exportFileSchema = z
  .object({
    schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
    exportedAt: instant,
    appVersion: z.string(),
    animals: z.array(animalSchema),
    vaccinations: z.array(vaccinationSchema),
    treatments: z.array(treatmentSchema),
    weightEntries: z.array(weightEntrySchema),
  })
  .refine(
    (file) =>
      [file.animals, file.vaccinations, file.treatments, file.weightEntries].every(hasUniqueIds),
    { message: 'Identifiant en double' },
  )
  .refine(
    (file) => {
      const animalIds = new Set(file.animals.map((animal) => animal.id))
      return [...file.vaccinations, ...file.treatments, ...file.weightEntries].every((row) =>
        animalIds.has(row.animalId),
      )
    },
    { message: 'Entrée rattachée à un animal absent du fichier' },
  )

const versionSchema = z.object({ schemaVersion: z.number().int().positive() })

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function parseExportFile(text: string): ParsedExportFile {
  const document = parseJson(text)

  const version = versionSchema.safeParse(document)
  if (!version.success) return { ok: false, reason: 'invalid' }
  if (version.data.schemaVersion > EXPORT_SCHEMA_VERSION) return { ok: false, reason: 'newer' }

  const file = exportFileSchema.safeParse(document)
  if (!file.success) return { ok: false, reason: 'invalid' }

  const { animals, vaccinations, treatments, weightEntries } = file.data
  return { ok: true, data: { animals, vaccinations, treatments, weightEntries } }
}
