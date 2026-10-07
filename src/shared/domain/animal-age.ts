import { differenceInCalendarDays, differenceInMonths, differenceInYears, parseISO } from 'date-fns'

export type AnimalAge = { unit: 'year' | 'month' | 'week'; value: number }

type Translate = (key: string, named: Record<string, unknown>, plural: number) => string

const MAX_AGE_IN_WEEKS = 16

/** Dates civiles `yyyy-MM-dd` ; `today` vient de l'appelant, le module ne lit jamais l'horloge. */
export function animalAge(birthDate: string | null, today: string): AnimalAge | null {
  if (birthDate === null) return null

  const birth = parseISO(birthDate)
  const now = parseISO(today)

  const years = differenceInYears(now, birth)
  if (years >= 1) return { unit: 'year', value: years }

  const weeks = Math.floor(differenceInCalendarDays(now, birth) / 7)
  if (weeks <= MAX_AGE_IN_WEEKS) return { unit: 'week', value: Math.max(weeks, 0) }

  return { unit: 'month', value: differenceInMonths(now, birth) }
}

/** `10 semaines`, `environ 10 semaines` quand la date est approximative. */
export function animalAgeText(
  t: Translate,
  birth: { birthDate: string | null; approximate: boolean },
  today: string,
): string | null {
  const age = animalAge(birth.birthDate, today)
  if (age === null) return null

  const text = t(`animals.age.${age.unit}`, { n: age.value }, age.value)
  if (!birth.approximate || age.value === 0) return text

  return t('animals.age.approximate', { age: text }, age.value)
}
