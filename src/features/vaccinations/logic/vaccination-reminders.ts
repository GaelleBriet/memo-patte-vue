import type { Animal } from '@/features/animals/schema/animal.schema'
import { isDoneForDue } from '@/shared/domain/due-reminders'
import type { EntryReminders } from '@/shared/domain/due-reminders-schedule'
import {
  vaccinationReminderPlan,
  type CarnetReminderSettings,
  type ReminderTranslate,
} from '@/shared/domain/reminder-plan'
import type { Vaccination } from '../schema/vaccination.schema'

type RemindedVaccination = Pick<
  Vaccination,
  'id' | 'name' | 'dueDate' | 'lastInjectionDate' | 'deletedAt'
>

/** Une échéance déplacée sans injection n'est pas notée. */
export function isInjectionNoted(
  vaccination: Pick<Vaccination, 'lastInjectionDate' | 'dueDate'>,
  dueDate: string,
): boolean {
  return vaccination.dueDate !== dueDate && isDoneForDue(dueDate, vaccination.lastInjectionDate)
}

export function vaccinationReminders(
  t: ReminderTranslate,
  vaccination: RemindedVaccination,
  animal: Pick<Animal, 'name' | 'deletedAt'> | null,
  settings: CarnetReminderSettings,
  now: Date,
): EntryReminders {
  const isNoted = (dueDate: string) => isInjectionNoted(vaccination, dueDate)
  if (vaccination.deletedAt !== null || animal === null || animal.deletedAt !== null) {
    return { care: null, isNoted }
  }

  const { id, name, dueDate } = vaccination
  const source = { id, name, animalName: animal.name, dueDate }
  return { care: vaccinationReminderPlan(t, source, settings, now), isNoted }
}
