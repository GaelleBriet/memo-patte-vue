import type { Reminder } from '@/core/notifications'
import type { Animal } from '@/features/animals/animal.schema'
import { DAYS_BEFORE_DUE, dueReminders, type Translate } from '@/shared/due-reminders'
import type { Treatment } from './treatment.schema'

type RemindedTreatment = Pick<Treatment, 'id' | 'name' | 'type' | 'nextDueDate' | 'deletedAt'>

export function treatmentReminders(
  t: Translate,
  treatment: RemindedTreatment,
  animal: Pick<Animal, 'name' | 'deletedAt'> | null,
  now: Date,
): Reminder[] {
  if (treatment.deletedAt !== null || animal === null || animal.deletedAt !== null) return []

  const named = {
    type: t(`treatments.type.${treatment.type}`, {}),
    name: treatment.name,
    animal: animal.name,
    days: DAYS_BEFORE_DUE,
  }
  return dueReminders(
    { kind: 'treatment', id: treatment.id, dueDate: treatment.nextDueDate },
    (moment) =>
      moment === 'before'
        ? {
            title: t('reminders.treatment.beforeTitle', named),
            body: t('reminders.treatment.beforeBody', {}),
          }
        : {
            title: t('reminders.treatment.dueTitle', named),
            body: t('reminders.treatment.dueBody', {}),
          },
    now,
  )
}
