import { z } from 'zod'

import { treatmentFrequencySchema } from './treatment.schema'

export const treatmentPeriodSchema = z.object({
  id: z.uuid(),
  treatmentId: z.uuid(),
  animalId: z.uuid(),
  startsOn: z.iso.date(),
  firstDueOn: z.iso.date(),
  frequency: treatmentFrequencySchema,
  /** `null` tant que la période n'est pas arrêtée. */
  stoppedOn: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})

export type TreatmentPeriod = z.output<typeof treatmentPeriodSchema>
