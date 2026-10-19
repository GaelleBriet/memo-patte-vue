import { z } from 'zod'

import { CLOCK_TIME_PATTERN } from '@/shared/domain/clock-time'

export const DOSE_STATUSES = ['given', 'missed', 'postponed', 'extra', 'shift', 'not-due'] as const

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
  /** Report : jour d'arrivée ; décalage : jour d'ancrage ; `null` pour une prise. */
  targetOn: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})

/** Une prise, lue telle qu'écrite. */
export type TreatmentDose = z.output<typeof treatmentDoseSchema>

export type DoseOwner = Pick<TreatmentDose, 'id' | 'treatmentId' | 'animalId'>

/** Ce qu'une écriture pose sur une ligne ; son traitement et son animal ne changent jamais. */
export type DoseFields = Pick<
  TreatmentDose,
  'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'targetOn'
>

/** `expectedUpdatedAt` : la ligne doit être restée telle qu'un geste l'a écrite (lot inverse). */
type Unchanged = { expectedUpdatedAt?: string }

/**
 * `rank` (lot inverse) : rang de la ligne, de la moins à la plus récemment modifiée avant le geste,
 * parmi celles du lot, ou parmi les lignes supprimées et gardées devant (`undoKeepingAhead`) ;
 * elle est datée de l'instant de l'écriture plus `rank` millisecondes.
 */
type Ranked = { rank?: number }

/** Une écriture du moteur d'échéances ; `restore` ne sert qu'à défaire un `delete`. */
export type DoseWrite =
  | ({ action: 'create'; dose: DoseFields } & DoseOwner)
  | ({ action: 'rewrite'; id: string; dose: DoseFields } & Unchanged & Ranked)
  | ({ action: 'delete'; id: string } & Unchanged)
  | ({ action: 'restore'; id: string } & Unchanged & Ranked)
