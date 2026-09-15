import { isAfter } from 'date-fns'

import type { Reminder } from '@/core/notifications'
import type { Animal } from '@/features/animals/animal.schema'
import {
  DAYS_BEFORE_DUE,
  DAYS_OVERDUE,
  dueReminderSpan,
  dueReminders,
  reminderWindowEnd,
  type DueReminderTexts,
  type Translate,
} from '@/shared/due-reminders'
import { addFrequency } from './treatment-frequency'
import type { Treatment, TreatmentFrequency } from './treatment.schema'

type RemindedTreatment = Pick<
  Treatment,
  'id' | 'name' | 'type' | 'frequency' | 'nextDueDate' | 'deletedAt'
>

/**
 * Échéances dont un rappel tombe dans la fenêtre, en continuant au rythme de la fréquence quand les
 * prises ne sont pas notées. Chaque cycle part de `nextDueDate` : enchaîner les mois ferait dériver
 * un 31 vers le 28.
 */
function occurrenceDates(nextDueDate: string, frequency: TreatmentFrequency, now: Date): string[] {
  const windowEnd = reminderWindowEnd(now)
  const dates: string[] = []
  for (let cycle = 0; ; cycle += 1) {
    const dueDate = addFrequency(nextDueDate, { ...frequency, value: frequency.value * cycle })
    const { first, last } = dueReminderSpan(dueDate)
    if (isAfter(first, windowEnd)) return dates
    if (isAfter(last, now)) dates.push(dueDate)
  }
}

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
  const texts: DueReminderTexts = (moment) => {
    switch (moment) {
      case 'before':
        return {
          title: t('reminders.treatment.beforeTitle', named),
          body: t('reminders.treatment.beforeBody', {}),
        }
      case 'due':
        return {
          title: t('reminders.treatment.dueTitle', named),
          body: t('reminders.treatment.dueBody', {}),
        }
      case 'overdue':
        return {
          title: t('reminders.treatment.overdueTitle', { ...named, days: DAYS_OVERDUE }),
          body: t('reminders.treatment.overdueBody', {}),
        }
    }
  }

  return dueReminders(
    { kind: 'treatment', id: treatment.id },
    occurrenceDates(treatment.nextDueDate, treatment.frequency, now),
    texts,
    now,
  )
}
