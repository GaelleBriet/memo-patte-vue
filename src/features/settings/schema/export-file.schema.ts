import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

import { MAX_MODEL_LENGTH } from '@/core/device/device.repository'
import { isPhotoFileName } from '@/core/photos/photo-storage'
import {
  animalInputSchema,
  animalSpeciesSchema,
  departureReasonSchema,
} from '@/features/animals/schema/animal.schema'
import { DOSE_STATUSES } from '@/features/treatments/schema/treatment-dose.schema'
import {
  doseQuantitySchema,
  doseUnitSchema,
  hasWholeDosage,
  REMINDER_OFFSETS_MINUTES,
  treatmentTimesSchema,
} from '@/features/treatments/schema/treatment-period.schema'
import {
  treatmentFrequencySchema,
  treatmentNameSchema,
  treatmentTypeSchema,
} from '@/features/treatments/schema/treatment.schema'
import { vaccinationInputSchema } from '@/features/vaccinations/schema/vaccination.schema'
import { weightEntryInputSchema } from '@/features/weight/schema/weight.schema'
import { EXPORT_SCHEMA_VERSION } from '../logic/export-format'
import { carnetSettingsSchema } from './carnet-settings.schema'
import { isCalendarDay, MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR } from '@/shared/domain/calendar-day'
import { CLOCK_TIME_PATTERN } from '@/shared/domain/clock-time'
import type { ImportFile } from '@/shared/domain/import-plan'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

export type ImportFileError = 'invalid' | 'newer' | 'older' | 'outOfRange' | 'nameTooLong'

export type ParsedExportFile =
  { ok: true; file: ImportFile } | { ok: false; reason: ImportFileError }

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_LENGTH = 200

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
  .or(z.iso.datetime({ precision: -1 }))
  .refine(isYearInRange)
  .transform((value) => new Date(value).toISOString())
const timestamps = { createdAt: instant, updatedAt: instant }
const stamps = { ...timestamps, createdByDevice: z.uuid(), updatedByDevice: z.uuid() }
const optionalName = z
  .string()
  .trim()
  .max(MAX_NAME_LENGTH)
  .nullable()
  .transform((value) => value || null)

const carnetSettingsFileSchema = carnetSettingsSchema.extend(stamps)

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
  ...stamps,
})

const vaccinationFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: vaccinationInputSchema.shape.name,
  plannedDueDate: day.nullable(),
  ...stamps,
})

const injectionFileSchema = z.object({
  id: z.uuid(),
  vaccinationId: z.uuid(),
  animalId: z.uuid(),
  injectedOn: pastDay,
  nextDueDate: day.nullable(),
  ...stamps,
})

const treatmentFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  name: treatmentNameSchema,
  type: treatmentTypeSchema,
  ...stamps,
})

const periodFileSchema = z
  .object({
    id: z.uuid(),
    treatmentId: z.uuid(),
    animalId: z.uuid(),
    startsOn: day,
    firstDueOn: day,
    referenceOn: day,
    endsOn: day.nullable(),
    stoppedOn: day.nullable(),
    frequency: treatmentFrequencySchema,
    times: treatmentTimesSchema,
    doseQuantity: doseQuantitySchema.nullable(),
    doseUnit: doseUnitSchema.nullable(),
    reminderOffsetMinutes: z.literal([...REMINDER_OFFSETS_MINUTES]).nullable(),
    reminderTime: clockTime.nullable(),
    ...stamps,
  })
  .refine(hasWholeDosage)
  .refine(({ startsOn, firstDueOn, endsOn }) =>
    [firstDueOn, endsOn].every((date) => date === null || date >= startsOn),
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
    ...stamps,
  })
  .refine((dose) => ['given', 'extra'].includes(dose.status) === (dose.givenOn !== null))
  .refine((dose) => dose.status !== 'extra' || dose.dueOn === dose.givenOn)

const weightEntryFileSchema = z.object({
  id: z.uuid(),
  animalId: z.uuid(),
  weightKg: weightEntryInputSchema.shape.weightKg,
  measuredOn: pastDay,
  ...stamps,
})

const deviceFileSchema = z.object({
  id: z.uuid(),
  model: z.string().max(MAX_MODEL_LENGTH).nullable(),
  installedAt: instant,
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
    devices: z.array(deviceFileSchema),
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
      file.devices,
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
    return file.treatments.every(({ id }) => withPeriod.has(id))
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
    devices,
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
        devices,
      },
    },
  }
}
