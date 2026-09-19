import type { Reminder } from '@/core/notifications'
import type { Animal } from '@/features/animals/schema/animal.schema'
import {
  DAYS_BEFORE_DUE,
  DAYS_OVERDUE,
  dueReminders,
  type DueReminderTexts,
  type Translate,
} from '@/shared/domain/due-reminders'
import type { Vaccination } from '../schema/vaccination.schema'

type RemindedVaccination = Pick<Vaccination, 'id' | 'name' | 'dueDate' | 'deletedAt'>

export function vaccinationReminders(
  t: Translate,
  vaccination: RemindedVaccination,
  animal: Pick<Animal, 'name' | 'deletedAt'> | null,
  now: Date,
): Reminder[] {
  if (vaccination.deletedAt !== null || animal === null || animal.deletedAt !== null) return []

  const named = { name: vaccination.name, animal: animal.name, days: DAYS_BEFORE_DUE }
  const texts: DueReminderTexts = (moment) => {
    switch (moment) {
      case 'before':
        return {
          title: t('reminders.vaccination.beforeTitle', named),
          body: t('reminders.vaccination.beforeBody', {}),
        }
      case 'due':
        return {
          title: t('reminders.vaccination.dueTitle', named),
          body: t('reminders.vaccination.dueBody', {}),
        }
      case 'overdue':
        return {
          title: t('reminders.vaccination.overdueTitle', { ...named, days: DAYS_OVERDUE }),
          body: t('reminders.vaccination.overdueBody', {}),
        }
    }
  }

  const dueDates = vaccination.dueDate === null ? [] : [vaccination.dueDate]
  return dueReminders({ kind: 'vaccination', id: vaccination.id }, dueDates, texts, now)
}
