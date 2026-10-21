import { z } from 'zod'

import { MAX_MODEL_LENGTH } from '@/core/device/device-model'
import { isPhotoFileName } from '@/core/photos/photo-storage'
import {
  animalInputSchema,
  animalSpeciesSchema,
  departureReasonSchema,
} from '@/features/animals/schema/animal.schema'
import { gridBeforeFromValue } from '@/features/treatments/schema/grid-before.schema'
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
  fromVersion7,
  fromVersion8,
  fromVersion9,
  type Version3Data,
  type Version5Data,
  type Version7Data,
  type Version8Data,
} from '../logic/export-file-versions'
import { fromVersion1, fromVersion2 } from '../logic/legacy-export'
import { withReplayedDoses } from '../logic/legacy-export-doses'
import { hasUniqueIds, isConsistentCarnet } from '../logic/export-carnet-links'
import {
  hasPreviousTargetDay,
  hasReportFactsOnlyOnReport,
  hasTargetOnlyOnMove,
  isConsistentDose,
} from '../logic/export-treatment-line-checks'
import { carnetSettingsSchema } from './carnet-settings.schema'
import {
  clockTime,
  dated,
  day,
  optionalName,
  pastDay,
  signed,
  stamps,
  timestamps,
} from './export-file-fields.schema'
import type { ExportData } from '@/shared/domain/carnet-data'
import { FALLEN_DOSES_ANSWERS } from '@/shared/domain/dose-calendar'
import { instantSchema } from '@/shared/domain/instant'

const MAX_TEXT_LENGTH = 200

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
const legacyDoseShape = { ...doseShape, status: z.enum(DOSE_STATUSES).exclude(['not-due']) }
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

const isConsistentPeriod = (period: PeriodRow) =>
  hasWholeDosage(period) && (period.endsOn === null || period.endsOn >= period.firstDueOn)

const deviceFileSchema = z.object({
  id: z.uuid(),
  model: z.string().max(MAX_MODEL_LENGTH).nullable(),
  installedAt: instantSchema,
  ...timestamps,
})

export const exportHeaderSchema = z.object({
  exportedAt: instantSchema,
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

const movedDosesOf = (shape: typeof doseShape | typeof legacyDoseShape) =>
  z.array(
    signed({ ...shape, targetOn: day.nullable() })
      .refine(isConsistentDose)
      .refine(hasTargetOnlyOnMove),
  )
const movedDoses = movedDosesOf(doseShape)
const legacyMovedDoses = movedDosesOf(legacyDoseShape)
const reportedDoses = z.array(
  signed({
    ...doseShape,
    targetOn: day.nullable(),
    previousTargetOn: day.nullable(),
    previousTargetTime: clockTime.nullable(),
    dueRank: z.number().int().min(1).nullable(),
  })
    .refine(isConsistentDose)
    .refine(hasTargetOnlyOnMove)
    .refine(hasReportFactsOnlyOnReport)
    .refine(hasPreviousTargetDay),
)

const version6PeriodShape = {
  ...periodShape,
  gridOriginOn: day.nullable(),
  firstDueChosen: z.boolean(),
  pastDosesStayUnlogged: z.boolean(),
}

const version8PeriodShape = {
  ...periodShape,
  gridOriginOn: day.nullable(),
  firstDueChosen: z.boolean(),
  fallenDosesAnswer: z.enum(FALLEN_DOSES_ANSWERS),
  settingsWrittenAt: instantSchema,
}

const version10FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(
      signed({
        ...version8PeriodShape,
        gridWrittenAt: instantSchema,
        gridBefore: z.unknown().optional().transform(gridBeforeFromValue),
      }).refine(isConsistentPeriod),
    ),
    treatmentDoses: reportedDoses,
  })
  .refine(isConsistentCarnet)

const version9FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(signed(version8PeriodShape).refine(isConsistentPeriod)),
    treatmentDoses: reportedDoses,
  })
  .refine(isConsistentCarnet)

const version8FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(signed(version8PeriodShape).refine(isConsistentPeriod)),
    treatmentDoses: movedDoses,
  })
  .refine(isConsistentCarnet)

const version7FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(
      signed({ ...version6PeriodShape, settingsWrittenAt: instantSchema }).refine(
        isConsistentPeriod,
      ),
    ),
    treatmentDoses: legacyMovedDoses,
  })
  .refine(isConsistentCarnet)

const version6FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(signed(version6PeriodShape).refine(isConsistentPeriod)),
    treatmentDoses: legacyMovedDoses,
  })
  .refine(isConsistentCarnet)

const version5FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(
      signed({ ...periodShape, gridOriginOn: day.nullable() }).refine(isConsistentPeriod),
    ),
    treatmentDoses: legacyMovedDoses,
  })
  .refine(isConsistentCarnet)

const version4FileSchema = z
  .object({
    ...signedCarnet,
    treatmentPeriods: z.array(
      signed({ ...periodShape, referenceOn: day }).refine(isConsistentPeriod),
    ),
    treatmentDoses: z.array(
      signed({ ...legacyDoseShape, nextDueDate: day }).refine(isConsistentDose),
    ),
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
    treatmentDoses: z.array(
      dated({ ...legacyDoseShape, nextDueDate: day }).refine(isConsistentDose),
    ),
    weightEntries: z.array(dated(weightEntryShape)),
  })
  .refine(isConsistentCarnet)

const legacyAnimal = dated({
  id: animalShape.id,
  name: animalShape.name,
  species: animalShape.species,
  breed: animalShape.breed,
  birthDate: pastDay.nullable().default(null),
  initialWeightKg: weightEntryShape.weightKg.nullable().default(null),
  photoFileName: animalShape.photoFileName,
})
const legacyVaccinationShape = {
  id: vaccinationShape.id,
  animalId: vaccinationShape.animalId,
  name: vaccinationShape.name,
}
const legacyTreatmentShape = {
  ...treatmentShape,
  type: z.enum(['deworming', 'antiparasitic']),
  frequency: treatmentFrequencySchema,
}

const isLinkedLegacyCarnet = (
  animals: { id: string }[],
  tables: { id: string; animalId: string }[][],
) => {
  const animalIds = new Set(animals.map(({ id }) => id))
  return (
    hasUniqueIds(animals) &&
    tables.every(
      (rows) => hasUniqueIds(rows) && rows.every(({ animalId }) => animalIds.has(animalId)),
    )
  )
}

/** Export v1, jusqu'à la 0.1.40 : une ligne par vaccin et par traitement, sa dernière injection ou prise. */
const version1FileSchema = z
  .object({
    animals: z.array(legacyAnimal),
    vaccinations: z.array(
      dated({
        ...legacyVaccinationShape,
        lastInjectionDate: pastDay,
        dueDate: day.nullable(),
      }),
    ),
    treatments: z.array(
      dated({
        ...legacyTreatmentShape,
        lastDoseDate: pastDay,
        nextDueDate: day,
        stoppedOn: day.nullable().default(null),
      }),
    ),
    weightEntries: z.array(dated(weightEntryShape)),
  })
  .refine((file) =>
    isLinkedLegacyCarnet(file.animals, [file.vaccinations, file.treatments, file.weightEntries]),
  )

type LegacyLinks = {
  vaccinations: { id: string }[]
  vaccinationInjections: { vaccinationId: string }[]
  treatments: { id: string }[]
  treatmentDoses: { treatmentId: string }[]
}

/** Comme l'import de la 0.1.48 : chaque vaccin a une injection, chaque traitement une prise, et inversement. */
function hasEveryParentAndChild(file: LegacyLinks): boolean {
  const vaccinations = new Set(file.vaccinations.map(({ id }) => id))
  const treatments = new Set(file.treatments.map(({ id }) => id))
  const injected = new Set(file.vaccinationInjections.map(({ vaccinationId }) => vaccinationId))
  const dosed = new Set(file.treatmentDoses.map(({ treatmentId }) => treatmentId))
  return (
    [...injected].every((id) => vaccinations.has(id)) &&
    [...dosed].every((id) => treatments.has(id)) &&
    [...vaccinations].every((id) => injected.has(id)) &&
    [...treatments].every((id) => dosed.has(id))
  )
}

/** Export v2, de la 0.1.41 à la 0.1.48 : l'historique des injections et des prises. */
const version2FileSchema = z
  .object({
    animals: z.array(legacyAnimal),
    vaccinations: z.array(dated(legacyVaccinationShape)),
    vaccinationInjections: z.array(dated(injectionShape)),
    treatments: z.array(dated({ ...legacyTreatmentShape, stoppedOn: day.nullable() })),
    treatmentDoses: z.array(
      dated({
        id: z.uuid(),
        treatmentId: z.uuid(),
        animalId: z.uuid(),
        givenOn: pastDay,
        nextDueDate: day,
        frequency: treatmentFrequencySchema,
      }),
    ),
    weightEntries: z.array(dated(weightEntryShape)),
  })
  .refine(
    (file) =>
      isLinkedLegacyCarnet(file.animals, [
        file.vaccinations,
        file.vaccinationInjections,
        file.treatments,
        file.treatmentDoses,
        file.weightEntries,
      ]) && hasEveryParentAndChild(file),
  )

export type ExportFileV1 = z.output<typeof version1FileSchema>
export type ExportFileV2 = z.output<typeof version2FileSchema>

export const exportVersionSchema = z.object({ schemaVersion: z.number().int().positive() })

export function exportFileSchemaOf(
  version: number,
  deviceId: string,
  today: string,
): z.ZodType<ExportData> {
  const fromVersion8To10 = (data: Version8Data) => fromVersion9(fromVersion8(data))
  const fromVersion7To10 = (data: Version7Data) => fromVersion8To10(fromVersion7(data))
  const fromVersion5To10 = (data: Version5Data) =>
    fromVersion7To10(fromVersion6(fromVersion5(data)))
  const fromVersion3To10 = (data: Version3Data) =>
    fromVersion5To10(fromVersion4(fromVersion3(data, deviceId)))
  const fromVersion2To10 = (
    carnet: ExportFileV2,
    ctx: z.RefinementCtx,
  ): z.input<typeof version10FileSchema> => {
    const data = fromVersion3To10(fromVersion2(carnet))
    const replayed = withReplayedDoses(data, carnet.treatmentDoses, deviceId, today)
    if (replayed !== null) return replayed
    ctx.addIssue({ code: 'custom', message: 'prise que le moteur ne sait pas placer' })
    return z.NEVER
  }
  if (version === 1) {
    return version1FileSchema
      .transform(fromVersion1)
      .transform(fromVersion2To10)
      .pipe(version10FileSchema)
  }
  if (version === 2) return version2FileSchema.transform(fromVersion2To10).pipe(version10FileSchema)
  if (version === 3) return version3FileSchema.transform(fromVersion3To10)
  if (version === 4)
    return version4FileSchema.transform((data) => fromVersion5To10(fromVersion4(data)))
  if (version === 5) return version5FileSchema.transform(fromVersion5To10)
  if (version === 6)
    return version6FileSchema.transform((data) => fromVersion7To10(fromVersion6(data)))
  if (version === 7) return version7FileSchema.transform(fromVersion7To10)
  if (version === 8) return version8FileSchema.transform(fromVersion8To10)
  return version === 9 ? version9FileSchema.transform(fromVersion9) : version10FileSchema
}
