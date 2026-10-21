import { z } from 'zod'

import { treatmentFrequencySchema } from '@/features/treatments/schema/treatment.schema'
import { hasEveryParentAndChild, isLinkedLegacyCarnet } from '../logic/legacy-export-links'
import {
  legacyAnimal,
  legacyTreatmentShape,
  legacyVaccinationShape,
} from './export-file-legacy-rows.schema'
import { dated, day, pastDay } from './export-file-fields.schema'
import { injectionShape, weightEntryShape } from './export-file-rows.schema'

/** Export v2, de la 0.1.41 à la 0.1.48 : l'historique des injections et des prises. */
export const version2FileSchema = z
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

export type ExportFileV2 = z.output<typeof version2FileSchema>
