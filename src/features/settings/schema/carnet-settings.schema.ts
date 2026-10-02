import { z } from 'zod'

import { CLOCK_TIME_PATTERN } from '@/shared/domain/clock-time'

export const carnetSettingsSchema = z.object({
  /** Heure locale `HH:mm` de tous les rappels de vaccins. */
  vaccineReminderTime: z.string().regex(CLOCK_TIME_PATTERN),
  /** « Me prévenir avant l'échéance ». */
  remindBeforeDue: z.boolean(),
})

export type CarnetSettings = z.output<typeof carnetSettingsSchema>

export const DEFAULT_CARNET_SETTINGS: CarnetSettings = {
  vaccineReminderTime: '09:00',
  remindBeforeDue: true,
}
