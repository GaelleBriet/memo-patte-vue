import { z } from 'zod'

export const carnetSettingsSchema = z.object({
  /** Heure locale `HH:mm` de tous les rappels de vaccins. */
  vaccineReminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** « Me prévenir avant l'échéance ». */
  remindBeforeDue: z.boolean(),
})

export type CarnetSettings = z.output<typeof carnetSettingsSchema>

export const DEFAULT_CARNET_SETTINGS: CarnetSettings = {
  vaccineReminderTime: '09:00',
  remindBeforeDue: true,
}
