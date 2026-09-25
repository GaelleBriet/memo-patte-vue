import { differenceInCalendarDays, differenceInMonths, parseISO } from 'date-fns'

export type Translate = (key: string, named: Record<string, unknown>, plural: number) => string

export type DueDelayText = { text: string; overdue: boolean }

/** Délai jusqu'à une échéance : en jours sous un mois, puis en mois, puis en années. */
export function dueDelayText(t: Translate, dueDate: string, today: string): DueDelayText {
  const due = parseISO(dueDate)
  const from = parseISO(today)
  const days = differenceInCalendarDays(due, from)
  if (days < 0) return { text: t('history.delay.overdue', { n: -days }, -days), overdue: true }
  if (days === 0) return { text: t('history.delay.today', {}, 1), overdue: false }
  if (days === 1) return { text: t('history.delay.tomorrow', {}, 1), overdue: false }

  const months = differenceInMonths(due, from)
  if (months === 0) return { text: t('history.delay.days', { n: days }, days), overdue: false }
  if (months < 12) return { text: t('history.delay.months', { n: months }, months), overdue: false }
  const years = Math.floor(months / 12)
  return { text: t('history.delay.years', { n: years }, years), overdue: false }
}
