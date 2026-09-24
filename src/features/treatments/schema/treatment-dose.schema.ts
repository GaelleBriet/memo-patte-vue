import { z } from 'zod'

import { treatmentFrequencySchema } from './treatment.schema'

export const treatmentDoseSchema = z.object({
  id: z.uuid(),
  treatmentId: z.uuid(),
  animalId: z.uuid(),
  givenOn: z.iso.date(),
  nextDueDate: z.iso.date(),
  /** Fréquence avec laquelle `nextDueDate` a été calculée, recopiée depuis le plan ce jour-là. */
  frequency: treatmentFrequencySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})

export type TreatmentDose = z.output<typeof treatmentDoseSchema>
