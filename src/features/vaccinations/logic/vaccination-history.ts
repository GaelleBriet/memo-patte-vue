import { nextReminderDate } from './vaccination-done'
import type { InjectionDates } from '../repository/vaccination-injections.repository'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'
import { dueDelayText } from '@/shared/domain/due-delay'
import { formatDayMonthOrYear, formatFullDate, formatLongDate } from '@/shared/utils/format'

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

/** Déplacée au jour de son rappel « autre date » ou après, l'injection n'a plus de rappel valable. */
export function needsNewReminder(injection: InjectionDates, injectedOn: string): boolean {
  const chosen = chosenReminder(injection)
  return chosen.kind === 'date' && injectedOn >= chosen.date
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

export type NextReminderTone = 'today' | 'overdue' | null

export type VaccinationDetailTexts = {
  subtitle: string
  /** Ligne du haut de la carte, pour un vaccin encore sans injection. */
  top: string | null
  due: { value: string; delay: string | null; tone: NextReminderTone } | null
  /** Sous la valeur : « Aucune injection notée », le jour du rendez-vous d'un vaccin prévu. */
  note: string | null
  doneLabel: string
  editLabel: string
  otherDateLabel: string
  counter: string
}

function nextReminderDue(t: Translate, dueDate: string, today: string) {
  if (dueDate === today) {
    return { value: t('vaccinations.detail.today'), delay: null, tone: 'today' as const }
  }
  if (dueDate < today) {
    const date = formatDayMonthOrYear(dueDate, today)
    return {
      value: t('vaccinations.detail.overdueSince', { date }),
      delay: null,
      tone: 'overdue' as const,
    }
  }
  return {
    value: formatLongDate(dueDate),
    delay: dueDelayText(t, dueDate, today).text,
    tone: null,
  }
}

export function vaccinationDetailTexts(
  t: Translate,
  vaccination: Pick<Vaccination, 'name' | 'dueDate' | 'lastInjectionDate'>,
  { animal, today, injections }: { animal: string; today: string; injections: number },
): VaccinationDetailTexts {
  const { name, dueDate, lastInjectionDate } = vaccination
  const isPlanned = lastInjectionDate === null
  const isAppointmentDay = isPlanned && dueDate === today
  return {
    subtitle: t('vaccinations.sheet.subtitle', { animal }),
    top: isPlanned
      ? isAppointmentDay
        ? t('vaccinations.detail.firstVaccineShort')
        : t('vaccinations.detail.firstVaccine')
      : null,
    due: dueDate === null ? null : nextReminderDue(t, dueDate, today),
    note: isAppointmentDay ? t('vaccinations.detail.noInjection') : null,
    doneLabel: t('vaccinations.detail.doneLabel', { name, animal }),
    editLabel: t('vaccinations.detail.editLabel', { name }),
    otherDateLabel: t('vaccinations.detail.otherDateLabel'),
    counter: String(injections),
  }
}

/** Jours déjà pris par les autres injections : une injection ne s'y déplace pas. */
export function injectionDatesExcept(injections: VaccinationInjection[], id: string): string[] {
  return injections.filter((injection) => injection.id !== id).map(({ injectedOn }) => injectedOn)
}

/** Textes de « Changer la date » et « Supprimer cette injection », et de leur toast. */
export function injectionGestureTexts(t: Translate, injectedOn: string, today: string) {
  return {
    changeDateSubtitle: t('vaccinations.detail.changeDateSubtitle', {
      date: formatLongDate(injectedOn),
    }),
    removed: t('vaccinations.detail.toast.removed', {
      date: formatDayMonthOrYear(injectedOn, today),
    }),
    undoRemove: t('vaccinations.detail.toast.undoRemove', { date: formatFullDate(injectedOn) }),
    moved: (date: string) =>
      t('vaccinations.detail.toast.moved', { date: formatDayMonthOrYear(date, today) }),
    undoMove: t('vaccinations.detail.toast.undoMove'),
  }
}

/** Dialogue de suppression d'un vaccin, depuis son menu ou sa seule injection. */
export function vaccinationDeleteTexts(
  t: Translate,
  name: string,
  { onlyInjection }: { onlyInjection: boolean },
) {
  return {
    title: t('vaccinations.detail.deleteDialog.title', { name }),
    text: onlyInjection
      ? t('vaccinations.detail.deleteDialog.onlyInjection', { name })
      : t('vaccinations.detail.deleteDialog.text'),
    cancel: t('vaccinations.detail.deleteDialog.cancel'),
    confirm: t('vaccinations.detail.deleteDialog.confirm'),
    deleted: t('vaccinations.detail.toast.deleted', { name }),
    failed: t('vaccinations.detail.errors.delete', { name }),
  }
}
