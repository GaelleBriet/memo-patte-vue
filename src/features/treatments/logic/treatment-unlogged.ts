import { hasSeveralTimes } from './treatment-gestures'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { DoseGesture, Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import {
  formatClockTime,
  formatDayList,
  formatDayMonthOrYear,
  formatDayRange,
  formatLongDate,
} from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type UnloggedBanner = {
  dues: Due[]
  title: string
  when: string
  note: string
  allGivenLabel: string
  chooseDaysLabel: string
  /** Une seule dose : « Donnée » / « Oubliée » à la place de « Toutes données » / « Choisir les jours ». */
  single: { due: Due; givenLabel: string; missedLabel: string } | null
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

export function allGivenGestures(dues: readonly Due[]): DoseGesture[] {
  return dues.map((due) => ({ kind: 'given', due, givenOn: due.dueOn }))
}

/** `null` sans dose non renseignée : le bandeau ne tient qu'à elles, quelle que soit la phase. */
export function unloggedBanner(
  t: Translate,
  treatment: Pick<TreatmentWithHistory, 'name' | 'periods'>,
  schedule: Pick<TreatmentSchedule, 'unloggedDoses'>,
  today: string,
): UnloggedBanner | null {
  const dues = schedule.unloggedDoses
  const [only] = dues
  if (only === undefined) return null
  const count = dues.length
  const when = unloggedWhen(t, dues, today, hasSeveralTimes(treatment, only.periodId))
  return {
    dues,
    title: t('treatments.unlogged.title', { n: count }, count),
    when,
    note: t('treatments.unlogged.note', {}, count),
    allGivenLabel: t('treatments.unlogged.allGivenLabel', { n: count, when }),
    chooseDaysLabel: t('treatments.unlogged.chooseDaysLabel', { name: treatment.name, when }),
    single:
      count > 1
        ? null
        : {
            due: only,
            givenLabel: t('treatments.unlogged.givenLabel', { when }),
            missedLabel: t('treatments.unlogged.missedLabel', { when }),
          },
  }
}
