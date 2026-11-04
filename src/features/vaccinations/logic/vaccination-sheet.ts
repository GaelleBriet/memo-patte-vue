import { addDays, parseISO } from 'date-fns'

import { nextReminderDate, type NextReminderChoice } from './vaccination-done'
import type { Vaccination } from '../schema/vaccination.schema'
import { toDay } from '@/shared/domain/calendar-day'
import { errorSummary } from '@/shared/utils/error-summary'
import { formatDayMonthOrYear, formatLongDate } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export type SheetVaccination = Pick<Vaccination, 'name' | 'dueDate' | 'lastInjectionDate'>

/** Le vaccin de la feuille, ou le texte de ce qui l'empêche : supprimé, illisible, ou sans identifiant. */
export async function loadSheetVaccination(
  t: Translate,
  id: string | null,
  load: (id: string) => Promise<Vaccination | null>,
): Promise<{ vaccination: Vaccination } | { failure: string }> {
  if (id === null) return { failure: t('vaccinations.form.errors.load') }
  try {
    const vaccination = await load(id)
    return vaccination === null
      ? { failure: t('vaccinations.form.errors.notFound') }
      : { vaccination }
  } catch (cause) {
    console.warn('Chargement du vaccin impossible :', errorSummary(cause))
    return { failure: t('vaccinations.form.errors.load') }
  }
}

export function vaccinationSheetTexts(
  t: Translate,
  vaccination: SheetVaccination,
  { animal, today }: { animal: string; today: string },
) {
  const named = { name: vaccination.name, animal }
  return {
    subtitle:
      vaccination.lastInjectionDate === null
        ? t('vaccinations.sheet.subtitleFirstVaccine', { animal })
        : t('vaccinations.sheet.subtitle', { animal }),
    due:
      vaccination.dueDate === null
        ? null
        : t('vaccinations.sheet.nextReminder', {
            date: formatDayMonthOrYear(vaccination.dueDate, today),
          }),
    doneTodayLabel: t('vaccinations.sheet.doneTodayLabel', named),
    calendarSubtitle: t('vaccinations.sheet.calendarSubtitle', named),
  }
}

/** Ce que F5 annonce sous les raccourcis : la date retenue, ou l'invitation à choisir. */
export function nextReminderSummary(
  t: Translate,
  injectedOn: string,
  choice: NextReminderChoice | null,
): { text: string; chosen: boolean } {
  if (choice === null) return { text: t('vaccinations.sheet.done.choose'), chosen: false }
  const date = nextReminderDate(injectedOn, choice)
  if (date === null) return { text: t('vaccinations.sheet.done.noReminder'), chosen: true }
  return { text: t('vaccinations.sheet.done.nextOn', { date: formatLongDate(date) }), chosen: true }
}

/** « Autre date » ne propose que des dates futures. */
export function earliestOtherDate(today: string): string {
  return toDay(addDays(parseISO(today), 1))
}
