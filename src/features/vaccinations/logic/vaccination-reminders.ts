import { subDays } from 'date-fns'

import type { Animal } from '@/features/animals/schema/animal.schema'
import { toDate, toDay } from '@/shared/domain/calendar-day'
import type { EntryReminders } from '@/shared/domain/due-reminders-schedule'
import {
  DAYS_BEFORE_VACCINATION,
  vaccinationReminderPlan,
  type CarnetReminderSettings,
  type ReminderTranslate,
} from '@/shared/domain/reminder-plan'
import type { Vaccination } from '../schema/vaccination.schema'

/** Rappels qu'une injection plus récente a remplacés, lus par `listReplacedDues`. */
export type ReplacedDues = { replacedDues: readonly string[] }

type RemindedVaccination = Pick<
  Vaccination,
  'id' | 'name' | 'dueDate' | 'lastInjectionDate' | 'deletedAt'
> &
  ReplacedDues

/**
 * Une échéance qui n'est plus celle du vaccin est notée si une injection l'a remplacée, ou si la
 * dernière injection date d'au plus tôt sa prévenance : un report ne garde pas la date d'origine.
 */
export function isInjectionNoted(
  vaccination: Pick<Vaccination, 'dueDate' | 'lastInjectionDate'> & ReplacedDues,
  dueDate: string,
): boolean {
  const { lastInjectionDate } = vaccination
  if (vaccination.dueDate === dueDate) return false
  if (vaccination.replacedDues.includes(dueDate)) return true
  return (
    lastInjectionDate !== null &&
    lastInjectionDate >= toDay(subDays(toDate(dueDate), DAYS_BEFORE_VACCINATION))
  )
}

export function vaccinationReminders(
  t: ReminderTranslate,
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
