import { differenceInCalendarDays, differenceInMonths, parseISO } from 'date-fns'
import type { Translate } from '@/core/i18n/translate'

export type DueDelayText = { text: string; overdue: boolean }

/** Jours civils écoulés depuis une échéance passée ; `0` le jour même et avant. */
export function overdueDays(dueDate: string, today: string): number {
  return Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(dueDate)))
}

/** Délai jusqu'à une échéance : en jours sous un mois, puis en mois, puis en années. */
export function dueDelayText(t: Translate, dueDate: string, today: string): DueDelayText {
  const late = overdueDays(dueDate, today)
  if (late > 0) return { text: t('history.delay.overdue', { n: late }, late), overdue: true }
  const due = parseISO(dueDate)
  const from = parseISO(today)
  const days = differenceInCalendarDays(due, from)
  if (days === 0) return { text: t('history.delay.today', {}, 1), overdue: false }
  if (days === 1) return { text: t('history.delay.tomorrow', {}, 1), overdue: false }

  const months = differenceInMonths(due, from)
  if (months === 0) return { text: t('history.delay.days', { n: days }, days), overdue: false }
  if (months < 12) return { text: t('history.delay.months', { n: months }, months), overdue: false }
  const years = Math.floor(months / 12)
  return { text: t('history.delay.years', { n: years }, years), overdue: false }
}
