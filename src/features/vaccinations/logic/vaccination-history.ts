import { nextReminderDate } from './vaccination-done'
import type { InjectionDates } from '../repository/vaccination-injections.repository'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'
import { dueDelayText, type DueDelayText } from '@/shared/domain/due-delay'
import { formatFullDate, formatLongDate } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type ChosenReminder =
  { kind: 'oneYear' } | { kind: 'threeYears' } | { kind: 'date'; date: string } | { kind: 'none' }

/** Déduit de l'écart entre l'injection et son rappel : un ou trois ans pile, sinon la date. */
export function chosenReminder({ injectedOn, nextDueDate }: InjectionDates): ChosenReminder {
  if (nextDueDate === null) return { kind: 'none' }
  if (nextDueDate === nextReminderDate(injectedOn, { kind: 'oneYear' })) return { kind: 'oneYear' }
  if (nextDueDate === nextReminderDate(injectedOn, { kind: 'threeYears' })) {
    return { kind: 'threeYears' }
  }
  return { kind: 'date', date: nextDueDate }
}

/** L'injection déplacée garde le rappel choisi : un rappel à un ou trois ans suit sa date. */
export function injectionDatesOn(injection: InjectionDates, injectedOn: string): InjectionDates {
  const chosen = chosenReminder(injection)
  switch (chosen.kind) {
    case 'oneYear':
    case 'threeYears':
      return { injectedOn, nextDueDate: nextReminderDate(injectedOn, chosen) }
    case 'date':
      return { injectedOn, nextDueDate: chosen.date }
    case 'none':
      return { injectedOn, nextDueDate: null }
  }
}

function chosenText(t: Translate, chosen: ChosenReminder): string {
  switch (chosen.kind) {
    case 'oneYear':
      return t('vaccinations.detail.chosen.oneYear')
    case 'threeYears':
      return t('vaccinations.detail.chosen.threeYears')
    case 'date':
      return t('vaccinations.detail.chosen.date', { date: formatLongDate(chosen.date) })
    case 'none':
      return t('vaccinations.detail.chosen.none')
  }
}

export type InjectionRow = {
  id: string
  date: string
  chosen: string
  optionsLabel: string
}

export function injectionRows(t: Translate, injections: VaccinationInjection[]): InjectionRow[] {
  return injections.map((injection) => ({
    id: injection.id,
    date: formatLongDate(injection.injectedOn),
    chosen: chosenText(t, chosenReminder(injection)),
    optionsLabel: t('vaccinations.detail.options', { date: formatFullDate(injection.injectedOn) }),
  }))
}

export type VaccinationDetailTexts = {
  subtitle: string
  due: { date: string; delay: DueDelayText } | null
  doneLabel: string
  counter: string
}

export function vaccinationDetailTexts(
  t: Translate,
  vaccination: Pick<Vaccination, 'name' | 'dueDate'>,
  { animal, today, injections }: { animal: string; today: string; injections: number },
): VaccinationDetailTexts {
  const { name, dueDate } = vaccination
  return {
    subtitle: t('vaccinations.sheet.subtitle', { animal }),
    due:
      dueDate === null
        ? null
        : { date: formatLongDate(dueDate), delay: dueDelayText(t, dueDate, today) },
    doneLabel: t('vaccinations.detail.doneLabel', { name, animal }),
    counter: String(injections),
  }
}
