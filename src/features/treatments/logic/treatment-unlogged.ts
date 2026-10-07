import { choiceSummary, type DayChoice } from './treatment-choose-days'
import { hasSeveralTimes } from './treatment-gestures'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { PastDose } from '../schema/treatment-form.schema'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import {
  formatClockTime,
  formatDayList,
  formatDayMonthOrYear,
  formatDayRange,
  formatLongDate,
} from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type PromptActionId = 'all-given' | 'choose-days' | 'given' | 'missed'

export type PromptAction = { id: PromptActionId; text: string; icon: string; label: string }

/** Des doses à renseigner et les deux gestes proposés : bandeau de la fiche, encart du formulaire. */
export type UnloggedPrompt = {
  dues: Due[]
  title: string
  subtitle: string
  note: string
  /** Les jours des doses, pour « Choisir les jours ». */
  when: string
  /** « Toutes données » et « Choisir les jours », ou « Donnée » et « Oubliée » pour une seule dose. */
  actions: PromptAction[]
}

const MAX_LISTED_DAYS = 3

function yearOf(day: string): string {
  return day.slice(0, 4)
}

/** « du 3 au 27 sept. », « 15 et 22 sept. », « 27 sept. à 20 h » : les jours des doses, l'heure pour une seule. */
export function unloggedWhen(
  t: Translate,
  dues: readonly Due[],
  today: string,
  severalTimes = false,
): string {
  const days = [...new Set(dues.map(({ dueOn }) => dueOn))].sort()
  const first = days[0]
  const last = days.at(-1)
  if (first === undefined || last === undefined) return ''
  const [only] = dues
  if (dues.length === 1 && only !== undefined) {
    const date = formatDayMonthOrYear(first, today)
    return severalTimes && only.dueTime !== null
      ? t('currentDose.at', { date, time: formatClockTime(only.dueTime) })
      : date
  }
  const thisYear = yearOf(first) === yearOf(today) && yearOf(last) === yearOf(today)
  if (!thisYear) {
    return t('treatments.unlogged.range', {
      start: formatLongDate(first),
      end: formatLongDate(last),
    })
  }
  return days.length <= MAX_LISTED_DAYS
    ? formatDayList(days)
    : t('treatments.unlogged.range', formatDayRange(first, last))
}

function actionsOf(
  t: Translate,
  count: number,
  when: string,
  chooseDaysLabel: string,
): PromptAction[] {
  if (count === 1) {
    return [
      {
        id: 'given',
        text: t('treatments.unlogged.given'),
        icon: 'ms:check',
        label: t('treatments.unlogged.givenLabel', { when }),
      },
      {
        id: 'missed',
        text: t('treatments.unlogged.missed'),
        icon: 'ms:close',
        label: t('treatments.unlogged.missedLabel', { when }),
      },
    ]
  }
  return [
    {
      id: 'all-given',
      text: t('treatments.unlogged.allGiven'),
      icon: 'ms:done_all',
      label: t('treatments.unlogged.allGivenLabel', { n: count, when }),
    },
    {
      id: 'choose-days',
      text: t('treatments.unlogged.chooseDays'),
      icon: 'ms:calendar_month',
      label: chooseDaysLabel,
    },
  ]
}

/** Ce qu'un geste direct répond pour toutes les doses ; « Choisir les jours » répond jour par jour. */
export function promptChoice(
  action: Exclude<PromptActionId, 'choose-days'>,
  dues: readonly Due[],
): DayChoice {
  return action === 'missed' ? { given: [], missed: [...dues] } : { given: [...dues], missed: [] }
}

/**
 * `null` sans dose non renseignée : le bandeau ne tient qu'à elles, quelle que soit la phase.
 * Jamais pour un animal qu'on ne suit plus (TR-37).
 */
export function unloggedBanner(
  t: Translate,
  treatment: Pick<TreatmentWithHistory, 'name' | 'periods'>,
  schedule: Pick<TreatmentSchedule, 'unloggedDoses'>,
  today: string,
  { followed = true }: { followed?: boolean } = {},
): UnloggedPrompt | null {
  if (!followed) return null
  const dues = schedule.unloggedDoses
  const [first] = dues
  if (first === undefined) return null
  const count = dues.length
  const when = unloggedWhen(t, dues, today, hasSeveralTimes(treatment, first.periodId))
  return {
    dues,
    title: t('treatments.unlogged.title', { n: count }, count),
    subtitle: when,
    note: t('treatments.unlogged.note', {}, count),
    when,
    actions: actionsOf(
      t,
      count,
      when,
      t('treatments.unlogged.chooseDaysLabel', { name: treatment.name, when }),
    ),
  }
}

/** L'encart du formulaire de création (TR-3) ; `null` sans échéance passée à annoncer. */
export function pastDosesPrompt(
  t: Translate,
  dues: readonly Due[],
  today: string,
  severalTimes: boolean,
  { followed = true }: { followed?: boolean } = {},
): UnloggedPrompt | null {
  if (!followed) return null
  const [first] = dues
  if (first === undefined) return null
  const count = dues.length
  const when = unloggedWhen(t, dues, today, severalTimes)
  const date = count === 1 ? when : formatDayMonthOrYear(first.dueOn, today)
  return {
    dues: [...dues],
    title: t('treatments.form.pastDoses.title', { n: count, date }, count),
    subtitle: t('treatments.form.pastDoses.question', {}, count),
    note: t('treatments.form.pastDoses.note'),
    when,
    actions: actionsOf(t, count, when, t('treatments.form.pastDoses.chooseDaysLabel', { when })),
  }
}

export type PromptResult = { text: string; edit: string; editLabel: string }

/** « 25 données · Modifier » : la réponse donnée dans l'encart, pas encore écrite. */
export function pastDosesResult(t: Translate, { given, missed }: DayChoice): PromptResult {
  return {
    text: choiceSummary(t, given.length, missed.length),
    edit: t('treatments.form.pastDoses.edit'),
    editLabel: t('treatments.form.pastDoses.editLabel'),
  }
}

export function pastDosesOf({ given, missed }: DayChoice): PastDose[] {
  return [
    ...given.map(({ dueOn, dueTime }): PastDose => ({ dueOn, dueTime, status: 'given' })),
    ...missed.map(({ dueOn, dueTime }): PastDose => ({ dueOn, dueTime, status: 'missed' })),
  ]
}
