import { z } from 'zod'

import { treatmentFrequencySchema } from './treatment.schema'
import { DOSE_UNITS, type DoseUnit } from '@/shared/domain/dosage'

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

export const doseUnitSchema = z.enum(DOSE_UNITS)

export const REMINDER_OFFSETS_MINUTES = [0, 15, 30, 60] as const
export type ReminderOffsetMinutes = (typeof REMINDER_OFFSETS_MINUTES)[number]

/** La période avec toutes ses colonnes : ce que l'export emporte et que l'import écrit. */
export type TreatmentPeriodRecord = TreatmentPeriod & {
  endsOn: string | null
  /** Heures `HH:mm` de chaque jour d'échéance ; vide pour un traitement sans heure. */
  times: string[]
  doseQuantity: number | null
  doseUnit: DoseUnit | null
  reminderOffsetMinutes: ReminderOffsetMinutes | null
  reminderTime: string | null
}
