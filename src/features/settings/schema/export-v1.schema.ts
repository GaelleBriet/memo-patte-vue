import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

/**
 * Export v1 (jusqu'à la 0.1.40), figé : ses règles ne suivent plus celles des formulaires, pour
 * qu'un ancien fichier se relise toujours comme sa version l'écrivait.
 */
const MAX_TEXT_LENGTH = 200
const MAX_WEIGHT_KG = 200
const MAX_FREQUENCY_VALUE = 365

const instant = z.iso.datetime()
const timestamps = { createdAt: instant, updatedAt: instant }
const pastDate = z.iso.date().refine((value) => !isFuture(parseISO(value)))
const name = z.string().trim().min(1).max(MAX_TEXT_LENGTH)
const weightKg = z.number().positive().max(MAX_WEIGHT_KG)
const optionalText = z
  .string()
  .trim()
  .max(MAX_TEXT_LENGTH)
  .nullable()
  .transform((value) => value || null)

const animalSchema = z.object({
  id: z.uuid(),
  name,
  species: z.enum(['dog', 'cat']),
  breed: optionalText,
  birthDate: pastDate.nullable().default(null),
  initialWeightKg: weightKg.nullable().default(null),
  photoFileName: z.string().max(MAX_TEXT_LENGTH).nullable(),
  ...timestamps,
})

const vaccinationSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name,
  lastInjectionDate: pastDate,
  dueDate: z.iso.date().nullable(),
  ...timestamps,
})

const treatmentSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name,
  type: z.enum(['deworming', 'antiparasitic']),
  frequency: z.object({
    value: z.number().int().positive().max(MAX_FREQUENCY_VALUE),
    unit: z.enum(['day', 'week', 'month']),
  }),
  lastDoseDate: pastDate,
  nextDueDate: z.iso.date(),
  stoppedOn: z.iso.date().nullable().optional(),
  ...timestamps,
})

const weightEntrySchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  weightKg,
  measuredOn: pastDate,
  ...timestamps,
})

function hasUniqueIds(rows: { id: string }[]): boolean {
  return new Set(rows.map((row) => row.id)).size === rows.length
}

export const exportFileV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    exportedAt: instant,
    appVersion: z.string().max(MAX_TEXT_LENGTH),
    animals: z.array(animalSchema),
    vaccinations: z.array(vaccinationSchema),
    treatments: z.array(treatmentSchema),
    weightEntries: z.array(weightEntrySchema),
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

export type ExportFileV1 = z.output<typeof exportFileV1Schema>
