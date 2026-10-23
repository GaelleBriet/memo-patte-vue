import type { Animal } from '@/features/animals/schema/animal.schema'
import type { EntryReminders } from '@/core/notifications/due-reminders-schedule'
import { currentLocale } from '@/core/i18n'
import { toDay } from '@/shared/domain/calendar-day'
import { treatmentReminderPlan, type CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import { currentPeriodOf, readableReadingOf } from './treatment-reading-adapter'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import type { Translate } from '@/core/i18n/translate'

/** Un traitement illisible n'a ni rappel ni échéance notée. */
export function treatmentReminders(
  t: Translate,
  treatment: TreatmentWithPeriods,
  animal: Pick<Animal, 'name' | 'deletedAt' | 'unfollowedOn'> | null,
  settings: CarnetReminderSettings,
  now: Date,
): EntryReminders {
  const reading = readableReadingOf(treatment, toDay(now))
  if (reading === null) return { care: null, isNoted: () => false }

  const { view } = reading
  const isNoted = view.isNoted
  const period = currentPeriodOf(treatment, view)
  if (
    period === null ||
    animal === null ||
    animal.deletedAt !== null ||
    animal.unfollowedOn !== null
  ) {
    return { care: null, isNoted }
  }

  const source = {
    id: treatment.id,
    name: treatment.name,
    animalName: animal.name,
    locale: currentLocale(),
    period,
    view,
  }
  return { care: treatmentReminderPlan(t, source, settings, now), isNoted }
}
