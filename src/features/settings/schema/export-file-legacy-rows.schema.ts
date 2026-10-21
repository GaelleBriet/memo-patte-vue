import { z } from 'zod'

import { treatmentFrequencySchema } from '@/features/treatments/schema/treatment.schema'
import { dated, pastDay } from './export-file-fields.schema'
import {
  animalShape,
  treatmentShape,
  vaccinationShape,
  weightEntryShape,
} from './export-file-rows.schema'

export const legacyAnimal = dated({
  id: animalShape.id,
  name: animalShape.name,
  species: animalShape.species,
  breed: animalShape.breed,
  birthDate: pastDay.nullable().default(null),
  initialWeightKg: weightEntryShape.weightKg.nullable().default(null),
  photoFileName: animalShape.photoFileName,
})
export const legacyVaccinationShape = {
  id: vaccinationShape.id,
  animalId: vaccinationShape.animalId,
  name: vaccinationShape.name,
}
export const legacyTreatmentShape = {
  ...treatmentShape,
  type: z.enum(['deworming', 'antiparasitic']),
  frequency: treatmentFrequencySchema,
}
