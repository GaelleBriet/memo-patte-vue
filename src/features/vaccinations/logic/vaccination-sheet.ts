import { addDays, format, parseISO } from 'date-fns'

import { nextReminderDate, type NextReminderChoice } from './vaccination-done'
import type { Vaccination } from '../schema/vaccination.schema'
import { formatDayMonthOrYear, formatLongDate } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type SheetVaccination = Pick<Vaccination, 'name' | 'dueDate'>

export function vaccinationSheetTexts(
  t: Translate,
  vaccination: SheetVaccination,
  { animal, today }: { animal: string; today: string },
) {
  const named = { name: vaccination.name, animal }
  return {
    subtitle: t('vaccinations.sheet.subtitle', { animal }),
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
  return format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
}
