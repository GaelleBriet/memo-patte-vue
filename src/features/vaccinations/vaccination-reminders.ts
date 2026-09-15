import type { Reminder } from '@/core/notifications'
import type { Animal } from '@/features/animals/animal.schema'
import { DAYS_BEFORE_DUE, dueReminders, type Translate } from '@/shared/due-reminders'
import type { Vaccination } from './vaccination.schema'

type RemindedVaccination = Pick<Vaccination, 'id' | 'name' | 'dueDate' | 'deletedAt'>

export function vaccinationReminders(
  t: Translate,
  vaccination: RemindedVaccination,
  animal: Pick<Animal, 'name' | 'deletedAt'> | null,
  now: Date,
): Reminder[] {
  if (vaccination.deletedAt !== null || animal === null || animal.deletedAt !== null) return []

  const named = { name: vaccination.name, animal: animal.name, days: DAYS_BEFORE_DUE }
  return dueReminders(
    { kind: 'vaccination', id: vaccination.id, dueDate: vaccination.dueDate },
    (moment) =>
      moment === 'before'
        ? {
            title: t('reminders.vaccination.beforeTitle', named),
            body: t('reminders.vaccination.beforeBody', {}),
          }
        : {
            title: t('reminders.vaccination.dueTitle', named),
            body: t('reminders.vaccination.dueBody', {}),
          },
    now,
  )
}
