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
import {
  fromVersion3,
  fromVersion4,
  fromVersion5,
  fromVersion6,
} from '../logic/export-file-versions'
import { carnetSettingsSchema } from './carnet-settings.schema'
import { isCalendarDay, MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR } from '@/shared/domain/calendar-day'
import { CLOCK_TIME_PATTERN } from '@/shared/domain/clock-time'
import type { ExportData } from '@/shared/domain/carnet-data'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

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
export const exportHeaderSchema = z.object({
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

const version6PeriodShape = {
  ...periodShape,
  gridOriginOn: day.nullable(),
  firstDueChosen: z.boolean(),
  pastDosesStayUnlogged: z.boolean(),
}

const version7FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(
      signed({ ...version6PeriodShape, settingsWrittenAt: instant }).refine(isConsistentPeriod),
    ),
    treatmentDoses: z.array(
      signed({ ...doseShape, targetOn: day.nullable() })
        .refine(isConsistentDose)
        .refine(({ status, targetOn }) => isMove(status) === (targetOn !== null)),
    ),
  })
  .refine(isConsistentCarnet)

const version6FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(signed(version6PeriodShape).refine(isConsistentPeriod)),
    treatmentDoses: z.array(
      signed({ ...doseShape, targetOn: day.nullable() })
        .refine(isConsistentDose)
        .refine(({ status, targetOn }) => isMove(status) === (targetOn !== null)),
    ),
  })
  .refine(isConsistentCarnet)

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

export const exportVersionSchema = z.object({ schemaVersion: z.number().int().positive() })

export function exportFileSchemaOf(version: number, deviceId: string): z.ZodType<ExportData> {
  if (version === 3) {
    return version3FileSchema.transform((data) =>
      fromVersion6(fromVersion5(fromVersion4(fromVersion3(data, deviceId)))),
    )
  }
  if (version === 4) {
    return version4FileSchema.transform((data) => fromVersion6(fromVersion5(fromVersion4(data))))
  }
  if (version === 5) return version5FileSchema.transform((data) => fromVersion6(fromVersion5(data)))
  return version === 6 ? version6FileSchema.transform(fromVersion6) : version7FileSchema
}
