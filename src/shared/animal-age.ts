import { differenceInCalendarDays, differenceInMonths, differenceInYears, parseISO } from 'date-fns'

export type AnimalAge = { unit: 'year' | 'month' | 'week'; value: number }

/** Dates civiles `yyyy-MM-dd` ; `today` vient de l'appelant, le module ne lit jamais l'horloge. */
export function animalAge(birthDate: string | null, today: string): AnimalAge | null {
  if (birthDate === null) return null

  const birth = parseISO(birthDate)
  const now = parseISO(today)

  const years = differenceInYears(now, birth)
  if (years >= 1) return { unit: 'year', value: years }

  const months = differenceInMonths(now, birth)
  if (months >= 1) return { unit: 'month', value: months }

  const weeks = Math.floor(differenceInCalendarDays(now, birth) / 7)
  return { unit: 'week', value: Math.max(weeks, 0) }
}
