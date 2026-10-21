import { z } from 'zod'

import { isPhotoFileName } from '@/core/photos/photo-storage'
import {
  animalInputSchema,
  animalSpeciesSchema,
  departureReasonSchema,
} from '@/features/animals/schema/animal.schema'
import {
  treatmentNameSchema,
  treatmentTypeSchema,
} from '@/features/treatments/schema/treatment.schema'
import { vaccinationInputSchema } from '@/features/vaccinations/schema/vaccination.schema'
import { weightEntryInputSchema } from '@/features/weight/schema/weight.schema'
import { day, optionalName, pastDay } from './export-file-fields.schema'

export const MAX_TEXT_LENGTH = 200

export const animalShape = {
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
export const vaccinationShape = {
  id: z.uuid(),
  animalId: z.uuid(),
  name: vaccinationInputSchema.shape.name,
  plannedDueDate: day.nullable(),
}
export const injectionShape = {
  id: z.uuid(),
  vaccinationId: z.uuid(),
  animalId: z.uuid(),
  injectedOn: pastDay,
  nextDueDate: day.nullable(),
}

export const treatmentShape = {
  id: z.uuid(),
  animalId: z.uuid(),
  name: treatmentNameSchema,
  type: treatmentTypeSchema,
}
export const weightEntryShape = {
  id: z.uuid(),
  animalId: z.uuid(),
  weightKg: weightEntryInputSchema.shape.weightKg,
  measuredOn: pastDay,
}
