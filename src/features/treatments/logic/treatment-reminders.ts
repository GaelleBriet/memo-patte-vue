import { format } from 'date-fns'

import type { Animal } from '@/features/animals/schema/animal.schema'
import { isDoneForDue } from '@/shared/domain/due-reminders'
import type { EntryReminders } from '@/shared/domain/due-reminders-schedule'
import {
  treatmentReminderPlan,
  type CarnetReminderSettings,
  type ReminderTranslate,
} from '@/shared/domain/reminder-plan'
import { isNoteLine, type TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { addFrequency } from './treatment-frequency'
import { currentPeriodOf, readableScheduleOf } from './treatment-schedule'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { Treatment } from '../schema/treatment.schema'

/** L'échéance est la prochaine dose ou un cycle suivant resté sans prise. */
export function isTreatmentDueDate(
  { nextDueDate, frequency }: Pick<Treatment, 'nextDueDate' | 'frequency'>,
  dueDate: string,
): boolean {
  for (let cycle = 0; ; cycle += 1) {
    const cycleDate = addFrequency(nextDueDate, { ...frequency, value: frequency.value * cycle })
    if (cycleDate >= dueDate) return cycleDate === dueDate
  }
}

/** Une échéance reportée ou changée de fréquence sans prise n'est pas notée. */
export function isDoseNoted(
  treatment: Pick<Treatment, 'lastDoseDate' | 'nextDueDate' | 'frequency'>,
  dueDate: string,
): boolean {
  return !isTreatmentDueDate(treatment, dueDate) && isDoneForDue(dueDate, treatment.lastDoseDate)
}

/** Sans heure, la clé de l'ancienne forme vaut pour toute prise de son jour. */
function notedBy(schedule: TreatmentSchedule): EntryReminders['isNoted'] {
  const notes = schedule.doses.filter(isNoteLine)
  return (dueDate, dueTime) =>
    notes.some((note) => note.dueOn === dueDate && (dueTime === null || note.dueTime === dueTime))
}

/** Un traitement illisible n'a ni rappel ni échéance notée. */
export function treatmentReminders(
  t: ReminderTranslate,
  treatment: TreatmentWithHistory,
  animal: Pick<Animal, 'name' | 'deletedAt'> | null,
  settings: CarnetReminderSettings,
  now: Date,
): EntryReminders {
  const schedule = readableScheduleOf(treatment, format(now, 'yyyy-MM-dd'))
  if (schedule === null) return { care: null, isNoted: () => false }

  const isNoted = notedBy(schedule)
  const period = currentPeriodOf(treatment, schedule)
  if (period === null || animal === null || animal.deletedAt !== null) {
    return { care: null, isNoted }
  }

  const source = {
    id: treatment.id,
    name: treatment.name,
    animalName: animal.name,
    period,
    schedule,
  }
  return { care: treatmentReminderPlan(t, source, settings, now), isNoted }
}
