import { isAfter } from 'date-fns'

import type { Reminder } from '@/core/notifications'
import type { Animal } from '@/features/animals/animal.schema'
import {
  DAYS_BEFORE_DUE,
  DAYS_OVERDUE,
  dueAt,
  dueReminders,
  type DueReminderTexts,
  type Translate,
} from '@/shared/due-reminders'
import { addFrequency } from './treatment-frequency'
import type { Treatment, TreatmentFrequency } from './treatment.schema'

type RemindedTreatment = Pick<
  Treatment,
  'id' | 'name' | 'type' | 'frequency' | 'nextDueDate' | 'deletedAt'
>

type ScheduledOccurrence = { dueDate: string; missedDueDate?: string }

/**
 * Première échéance encore à venir quand les prises ne sont pas notées, et celle manquée juste avant.
 * Chaque cycle part de `nextDueDate` : enchaîner les mois ferait dériver un 31 vers le 28.
 */
function scheduledOccurrence(
  nextDueDate: string,
  frequency: TreatmentFrequency,
  now: Date,
): ScheduledOccurrence {
  let missedDueDate: string | undefined
  let dueDate = nextDueDate
  for (let cycle = 1; !isAfter(dueAt(dueDate), now); cycle += 1) {
    missedDueDate = dueDate
    dueDate = addFrequency(nextDueDate, { ...frequency, value: frequency.value * cycle })
  }
  return { dueDate, missedDueDate }
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
    {
      kind: 'treatment',
      id: treatment.id,
      ...scheduledOccurrence(treatment.nextDueDate, treatment.frequency, now),
    },
    texts,
    now,
  )
}
