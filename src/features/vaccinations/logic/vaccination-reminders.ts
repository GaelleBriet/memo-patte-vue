import type { Animal } from '@/features/animals/schema/animal.schema'
import type { EntryReminders } from '@/shared/domain/due-reminders-schedule'
import { vaccinationReminderPlan, type CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import type { Vaccination } from '../schema/vaccination.schema'
import type { Translate } from '@/core/i18n/translate'

/** Rappels qu'une injection plus récente a remplacés, lus par `listReplacedDues`. */
export type ReplacedDues = { replacedDues: readonly string[] }

type RemindedVaccination = Pick<
  Vaccination,
  'id' | 'name' | 'dueDate' | 'lastInjectionDate' | 'deletedAt'
> &
  ReplacedDues

/** Une échéance déplacée sans injection n'est pas notée. */
export function isInjectionNoted(
  vaccination: Pick<Vaccination, 'dueDate'> & ReplacedDues,
  dueDate: string,
): boolean {
  return vaccination.dueDate !== dueDate && vaccination.replacedDues.includes(dueDate)
}

export function vaccinationReminders(
  t: Translate,
  vaccination: RemindedVaccination,
  animal: Pick<Animal, 'name' | 'deletedAt' | 'unfollowedOn'> | null,
  settings: CarnetReminderSettings,
  now: Date,
): EntryReminders {
  const isNoted = (dueDate: string) => isInjectionNoted(vaccination, dueDate)
  const remindable = animal !== null && animal.deletedAt === null && animal.unfollowedOn === null
  if (vaccination.deletedAt !== null || !remindable) {
    return { care: null, isNoted }
  }

  const { id, name, dueDate } = vaccination
  const source = { id, name, animalName: animal.name, dueDate }
  return { care: vaccinationReminderPlan(t, source, settings, now), isNoted }
}
