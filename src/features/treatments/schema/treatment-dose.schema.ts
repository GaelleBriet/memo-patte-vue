import { z } from 'zod'

import type { TreatmentFrequency } from './treatment.schema'

export const DOSE_STATUSES = ['given', 'missed', 'postponed'] as const

export const treatmentDoseSchema = z.object({
  id: z.uuid(),
  periodId: z.uuid(),
  treatmentId: z.uuid(),
  animalId: z.uuid(),
  dueOn: z.iso.date(),
  dueTime: z.iso.time({ precision: -1 }).nullable(),
  /** `null` pour une prise oubliée ou reportée. */
  givenOn: z.iso.date().nullable(),
  status: z.enum(DOSE_STATUSES),
  nextDueDate: z.iso.date(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})

/** Ce qu'une prise écrit en base. */
export type NewTreatmentDose = z.output<typeof treatmentDoseSchema>

/** Une prise lue, avec la fréquence de sa période. */
export type TreatmentDose = NewTreatmentDose & { frequency: TreatmentFrequency }
