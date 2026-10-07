import { nextReminderDate } from './vaccination-done'
import type { InjectionDates } from '../repository/vaccination-injections.repository'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'
import { dueDelayText } from '@/shared/domain/due-delay'
import { formatDayMonthOrYear, formatFullDate, formatLongDate } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

type Shortcut = { kind: 'oneMonth' } | { kind: 'oneYear' } | { kind: 'threeYears' }

export type ChosenReminder = Shortcut | { kind: 'date'; date: string } | { kind: 'none' }

const SHORTCUTS: readonly Shortcut[] = [
  { kind: 'oneMonth' },
  { kind: 'oneYear' },
  { kind: 'threeYears' },
]

/** Déduit de l'écart entre l'injection et son rappel : un mois, un an ou trois ans pile, sinon la date. */
export function chosenReminder({ injectedOn, nextDueDate }: InjectionDates): ChosenReminder {
  if (nextDueDate === null) return { kind: 'none' }
  const shortcut = SHORTCUTS.find(
    (candidate) => nextReminderDate(injectedOn, candidate) === nextDueDate,
  )
  return shortcut ?? { kind: 'date', date: nextDueDate }
}

/** Déplacée au jour de son rappel « autre date » ou après, l'injection n'a plus de rappel valable. */
export function needsNewReminder(injection: InjectionDates, injectedOn: string): boolean {
  const chosen = chosenReminder(injection)
  return chosen.kind === 'date' && injectedOn >= chosen.date
}

/** L'injection déplacée garde le rappel choisi : un raccourci suit sa date. */
export function injectionDatesOn(injection: InjectionDates, injectedOn: string): InjectionDates {
  const chosen = chosenReminder(injection)
  switch (chosen.kind) {
    case 'oneMonth':
    case 'oneYear':
    case 'threeYears':
      return { injectedOn, nextDueDate: nextReminderDate(injectedOn, chosen) }
    case 'date':
      return { injectedOn, nextDueDate: chosen.date }
    case 'none':
      return { injectedOn, nextDueDate: null }
  }
}

export type InjectionRow = {
  id: string
  date: string
  /** « Dernière injection », sur la tête seulement. */
  badge: string | null
  regular: boolean
  detail: string
  optionsLabel: string
}

/** `injections` : la tête d'abord. */
export function injectionRows(t: Translate, injections: VaccinationInjection[]): InjectionRow[] {
  return injections.map((injection, index) => ({
    id: injection.id,
    date: formatLongDate(injection.injectedOn),
    badge: index === 0 ? t('vaccinations.detail.lastInjection') : null,
    regular: index > 0,
    detail:
      injection.nextDueDate === null
        ? t('vaccinations.detail.noPlannedReminder')
        : t('vaccinations.detail.plannedReminder', { date: formatLongDate(injection.nextDueDate) }),
    optionsLabel: t('vaccinations.detail.options', { date: formatFullDate(injection.injectedOn) }),
  }))
}

export type NextReminderTone = 'today' | 'overdue' | null

export type VaccinationDetailTexts = {
  subtitle: string
  /** Ligne du haut de la carte : la dernière injection, ou « Premier vaccin ». */
  top: string
  due: { value: string; delay: string | null; tone: NextReminderTone } | null
  /** Sous la valeur : « Aucune injection notée », le jour du rendez-vous d'un vaccin prévu. */
  note: string | null
  doneLabel: string
  editLabel: string
  otherDateLabel: string
  counter: string
}

function nextReminderDue(t: Translate, dueDate: string, today: string, isPlanned: boolean) {
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
    delay: isPlanned
      ? dueDelayText(t, dueDate, today).text
      : t('vaccinations.section.status.upToDate'),
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
      : t('vaccinations.detail.lastInjectionOn', { date: formatLongDate(lastInjectionDate) }),
    due: dueDate === null ? null : nextReminderDue(t, dueDate, today, isPlanned),
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

/** Dialogue de suppression d'un vaccin, depuis son menu ou sa seule injection sans rappel. */
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
    undo: t('vaccinations.detail.toast.undoDelete', { name }),
    failed: t('vaccinations.detail.errors.delete', { name }),
  }
}

/** Rappel d'une injection passée : celui en cours si elle devient la dernière, aucun sinon. */
export function pastInjectionDue(
  vaccination: Pick<Vaccination, 'lastInjectionDate' | 'dueDate'>,
  injectedOn: string,
): string | null {
  return becomesLast(vaccination, injectedOn) ? vaccination.dueDate : null
}

/** Devenue la dernière le jour du rappel en cours ou après, l'injection fait ce rappel : on demande le suivant. */
export function pastInjectionNeedsReminder(
  vaccination: Pick<Vaccination, 'lastInjectionDate' | 'dueDate'>,
  injectedOn: string,
): boolean {
  const { dueDate } = vaccination
  return becomesLast(vaccination, injectedOn) && dueDate !== null && dueDate <= injectedOn
}

function becomesLast(
  { lastInjectionDate }: Pick<Vaccination, 'lastInjectionDate'>,
  injectedOn: string,
): boolean {
  return lastInjectionDate === null || injectedOn > lastInjectionDate
}

/** Seule injection d'un vaccin sans rappel à garder : c'est le vaccin qu'on supprime (VA-14). */
export class VaccinationWithoutReminderError extends Error {
  constructor(vaccinationId: string) {
    super(`Vaccin sans injection ni rappel : ${vaccinationId}`)
    this.name = 'VaccinationWithoutReminderError'
  }
}

/** Rappel que garde un vaccin privé de sa seule injection ; `null` : le vaccin ne peut pas rester. */
export function keptPlannedDueDate(
  plannedDueDate: string | null,
  removed: Pick<VaccinationInjection, 'nextDueDate'>,
): string | null {
  return plannedDueDate ?? removed.nextDueDate
}

export function pastInjectionError(
  injectedOn: string,
  { today, taken }: { today: string; taken: readonly string[] },
): 'future' | 'taken' | null {
  if (injectedOn > today) return 'future'
  return taken.includes(injectedOn) ? 'taken' : null
}

/** Feuille « Ajouter une injection passée » (V12 bis). */
export function pastInjectionTexts(t: Translate, named: { name: string; animal: string }) {
  return {
    header: t('vaccinations.sheet.calendarSubtitle', named),
    eyebrow: t('vaccinations.detail.past.eyebrow'),
    title: t('vaccinations.detail.past.title'),
    dateLabel: t('vaccinations.form.lastInjectionDate.label'),
    submit: t('vaccinations.detail.past.submit'),
    future: t('vaccinations.form.errors.lastInjectionDateFuture'),
    taken: t('vaccinations.detail.past.taken'),
  }
}

export function pastInjectionToast(t: Translate, injectedOn: string, today: string) {
  return {
    added: t('vaccinations.detail.toast.added', { date: formatDayMonthOrYear(injectedOn, today) }),
    undoAdd: t('vaccinations.detail.toast.undoAdd', { date: formatFullDate(injectedOn) }),
  }
}
