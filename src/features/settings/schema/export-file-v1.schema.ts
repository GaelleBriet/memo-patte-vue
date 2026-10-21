import { z } from 'zod'

import { isLinkedLegacyCarnet } from '../logic/legacy-export-links'
import {
  legacyAnimal,
  legacyTreatmentShape,
  legacyVaccinationShape,
} from './export-file-legacy-rows.schema'
import { dated, day, pastDay } from './export-file-fields.schema'
import { weightEntryShape } from './export-file-rows.schema'

/** Export v1, jusqu'à la 0.1.40 : une ligne par vaccin et par traitement, sa dernière injection ou prise. */
export const version1FileSchema = z
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

export type ExportFileV1 = z.output<typeof version1FileSchema>
