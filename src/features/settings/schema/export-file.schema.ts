import { format, isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

import { currentDeviceId } from '@/core/device/device-identity'
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
import { everyTreatmentReadable, fromVersion3, fromVersion4 } from '../logic/export-file-versions'
import { carnetSettingsSchema } from './carnet-settings.schema'
import { isCalendarDay, MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR } from '@/shared/domain/calendar-day'
import { CLOCK_TIME_PATTERN } from '@/shared/domain/clock-time'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { ImportFile } from '@/shared/domain/import-plan'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

export type ImportFileError = 'invalid' | 'newer' | 'older' | 'outOfRange' | 'nameTooLong'

export type ParsedExportFile =
  { ok: true; file: ImportFile } | { ok: false; reason: ImportFileError }

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
const OLDEST_READ_VERSION = 3
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

const animalShape = {
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
}
const vaccinationShape = {
  id: z.uuid(),
  animalId: z.uuid(),
  name: vaccinationInputSchema.shape.name,
  plannedDueDate: day.nullable(),
}
const injectionShape = {
  id: z.uuid(),
  vaccinationId: z.uuid(),
  animalId: z.uuid(),
  injectedOn: pastDay,
  nextDueDate: day.nullable(),
}
const treatmentShape = {
  id: z.uuid(),
  animalId: z.uuid(),
  name: treatmentNameSchema,
  type: treatmentTypeSchema,
}
const periodShape = {
  id: z.uuid(),
  treatmentId: z.uuid(),
  animalId: z.uuid(),
  startsOn: day,
  firstDueOn: day,
  endsOn: day.nullable(),
  stoppedOn: day.nullable(),
  frequency: treatmentFrequencySchema,
  times: treatmentTimesSchema,
  doseQuantity: doseQuantitySchema.nullable(),
  doseUnit: doseUnitSchema.nullable(),
  reminderOffsetMinutes: z.literal([...REMINDER_OFFSETS_MINUTES]).nullable(),
  reminderTime: clockTime.nullable(),
}
const doseShape = {
  id: z.uuid(),
  periodId: z.uuid(),
  treatmentId: z.uuid(),
  animalId: z.uuid(),
  dueOn: day,
  dueTime: clockTime.nullable(),
  givenOn: pastDay.nullable(),
  status: z.enum(DOSE_STATUSES),
}
const weightEntryShape = {
  id: z.uuid(),
  animalId: z.uuid(),
  weightKg: weightEntryInputSchema.shape.weightKg,
  measuredOn: pastDay,
}

type PeriodRow = Parameters<typeof hasWholeDosage>[0] & {
  firstDueOn: string
  endsOn: string | null
}
type DoseRow = { status: string; givenOn: string | null; dueOn: string }

const isConsistentPeriod = (period: PeriodRow) =>
  hasWholeDosage(period) && (period.endsOn === null || period.endsOn >= period.firstDueOn)
const isConsistentDose = (dose: DoseRow) =>
  ['given', 'extra'].includes(dose.status) === (dose.givenOn !== null) &&
  (dose.status !== 'extra' || dose.dueOn === dose.givenOn)
const isMove = (status: string) => status === 'postponed' || status === 'shift'

const deviceFileSchema = z.object({
  id: z.uuid(),
  model: z.string().max(MAX_MODEL_LENGTH).nullable(),
  installedAt: instant,
  ...timestamps,
})

type Row = { id: string; animalId: string }
type Carnet = {
  animals: { id: string }[]
  treatments: Row[]
  treatmentPeriods: (Row & { treatmentId: string })[]
} & Record<'vaccinations' | 'vaccinationInjections' | 'treatmentDoses' | 'weightEntries', Row[]>

const hasUniqueIds = (rows: { id: string }[]) =>
  new Set(rows.map(({ id }) => id)).size === rows.length

function isConsistentCarnet(data: Carnet): boolean {
  const { animals, treatments, treatmentPeriods } = data
  const children = [
    ...treatments,
    ...treatmentPeriods,
    ...data.vaccinations,
    ...data.vaccinationInjections,
    ...data.treatmentDoses,
    ...data.weightEntries,
  ]
  const animalIds = new Set(animals.map(({ id }) => id))
  const withPeriod = new Set(treatmentPeriods.map(({ treatmentId }) => treatmentId))
  return (
    [
      animals,
      treatments,
      treatmentPeriods,
      data.vaccinations,
      data.vaccinationInjections,
      data.treatmentDoses,
      data.weightEntries,
    ].every(hasUniqueIds) &&
    children.every(({ animalId }) => animalIds.has(animalId)) &&
    treatments.every(({ id }) => withPeriod.has(id))
  )
}

const signed = <S extends z.ZodRawShape>(shape: S) => z.object({ ...shape, ...stamps })
const dated = <S extends z.ZodRawShape>(shape: S) => z.object({ ...shape, ...timestamps })
const headerSchema = z.object({
  exportedAt: instant,
  appVersion: z.string().max(MAX_TEXT_LENGTH),
})

const signedCarnet = {
  carnetSettings: carnetSettingsSchema.extend(stamps).nullable(),
  animals: z.array(signed(animalShape)),
  vaccinations: z.array(signed(vaccinationShape)),
  vaccinationInjections: z.array(signed(injectionShape)),
  treatments: z.array(signed(treatmentShape)),
  weightEntries: z.array(signed(weightEntryShape)),
  devices: z.array(deviceFileSchema).refine(hasUniqueIds),
}

const version5FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(
      signed({ ...periodShape, gridOriginOn: day.nullable() }).refine(isConsistentPeriod),
    ),
    treatmentDoses: z.array(
      signed({ ...doseShape, targetOn: day.nullable() })
        .refine(isConsistentDose)
        .refine(({ status, targetOn }) => isMove(status) === (targetOn !== null)),
    ),
  })
  .refine(isConsistentCarnet)

const version4FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(
      signed({ ...periodShape, referenceOn: day }).refine(isConsistentPeriod),
    ),
    treatmentDoses: z.array(signed({ ...doseShape, nextDueDate: day }).refine(isConsistentDose)),
  })
  .refine(isConsistentCarnet)

const version3FileSchema = z
  .object({
    carnetSettings: carnetSettingsSchema.extend(timestamps).nullable(),
    animals: z.array(dated(animalShape)),
    vaccinations: z.array(dated(vaccinationShape)),
    vaccinationInjections: z.array(dated(injectionShape)),
    treatments: z.array(dated(treatmentShape)),
    treatmentPeriods: z.array(dated(periodShape).refine(isConsistentPeriod)),
    treatmentDoses: z.array(dated({ ...doseShape, nextDueDate: day }).refine(isConsistentDose)),
    weightEntries: z.array(dated(weightEntryShape)),
  })
  .refine(isConsistentCarnet)

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

function fileSchemaOf(version: number, deviceId: string): z.ZodType<ExportData> {
  if (version === 3) {
    return version3FileSchema.transform((data) => fromVersion4(fromVersion3(data, deviceId)))
  }
  return version === 4 ? version4FileSchema.transform(fromVersion4) : version5FileSchema
}

/**
 * La version tranche avant toute validation ; un export v3 ou v4 est converti au format courant
 * (plan §3.3), signé par `deviceId` quand il n'a pas d'appareil, puis relu par le moteur (Q40).
 */
export function parseExportFile(
  text: string,
  deviceId: string = currentDeviceId(),
  today: string = format(new Date(), 'yyyy-MM-dd'),
): ParsedExportFile {
  const document = parseJson(text)

  const version = versionSchema.safeParse(document)
  if (!version.success) return { ok: false, reason: 'invalid' }
  const { schemaVersion } = version.data
  if (schemaVersion > EXPORT_SCHEMA_VERSION) return { ok: false, reason: 'newer' }
  if (schemaVersion < OLDEST_READ_VERSION) return { ok: false, reason: 'older' }

  const header = headerSchema.safeParse(document)
  if (!header.success) return { ok: false, reason: refusalReason(header.error) }
  const parsed = fileSchemaOf(schemaVersion, deviceId).safeParse(document)
  if (!parsed.success) return { ok: false, reason: refusalReason(parsed.error) }
  const { data } = parsed
  if (!everyTreatmentReadable(data, today)) return { ok: false, reason: 'invalid' }

  return { ok: true, file: { schemaVersion: EXPORT_SCHEMA_VERSION, data } }
}
