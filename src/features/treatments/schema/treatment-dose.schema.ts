import { z } from 'zod'

import type { TreatmentFrequency } from './treatment.schema'
import { CLOCK_TIME_PATTERN } from '@/shared/domain/clock-time'
import type { DoseFields } from '@/shared/domain/treatment-schedule'

export const DOSE_STATUSES = ['given', 'missed', 'postponed', 'extra', 'shift'] as const

export const treatmentDoseSchema = z.object({
  id: z.uuid(),
  periodId: z.uuid(),
  treatmentId: z.uuid(),
  animalId: z.uuid(),
  dueOn: z.iso.date(),
  dueTime: z.string().regex(CLOCK_TIME_PATTERN).nullable(),
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

export type DoseOwner = Pick<NewTreatmentDose, 'id' | 'treatmentId' | 'animalId'>

/** `expectedUpdatedAt` : la ligne doit être restée telle qu'un geste l'a écrite (lot inverse). */
type Unchanged = { expectedUpdatedAt?: string }

/** Une écriture du moteur d'échéances ; `restore` ne sert qu'à défaire un `delete`. */
export type DoseWrite =
  | ({ action: 'create'; dose: DoseFields } & DoseOwner)
  | ({ action: 'rewrite'; id: string; dose: DoseFields } & Unchanged)
  | ({ action: 'delete'; id: string } & Unchanged)
  | ({ action: 'restore'; id: string } & Unchanged)
