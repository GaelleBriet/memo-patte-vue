import type { EntryReminders } from '@/core/notifications/due-reminders-schedule'
import { vaccinationReminderPlan, type CarnetReminderSettings } from './reminder-plan'
import type { Translate } from '@/core/i18n/translate'

type VaccinationDues = { dueDate: string | null; lastInjectionDate: string | null }

type RemindedAnimal = { name: string; deletedAt: string | null; unfollowedOn: string | null }

/** Rappels qu'une injection plus récente a remplacés, lus par `listReplacedDues`. */
export type ReplacedDues = { replacedDues: readonly string[] }

type RemindedVaccination = VaccinationDues &
  ReplacedDues & { id: string; name: string; deletedAt: string | null }

/** Une injection faite le jour d'un rappel ou après a fait ce rappel (VA-10). */
export function injectionMadeDue(dueDate: string, injectedOn: string): boolean {
  return dueDate <= injectedOn
}

/** Une échéance qui n'est plus celle du vaccin est notée si une injection l'a remplacée ou faite. */
export function isInjectionNoted(
  vaccination: VaccinationDues & ReplacedDues,
  dueDate: string,
): boolean {
  const { lastInjectionDate } = vaccination
  if (vaccination.dueDate === dueDate) return false
  if (vaccination.replacedDues.includes(dueDate)) return true
  return lastInjectionDate !== null && injectionMadeDue(dueDate, lastInjectionDate)
}

export function vaccinationReminders(
  t: Translate,
  vaccination: RemindedVaccination,
  animal: RemindedAnimal | null,
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
