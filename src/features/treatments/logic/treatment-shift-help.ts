import { refusalText } from './treatment-refusal-texts'
import { revealedDues, revealedDuesText } from './treatment-revealed-dues'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { nextDay } from '@/shared/domain/calendar-day'
import {
  applied,
  treatmentView,
  type GestureOutcome,
  type Refusal,
} from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'
import {
  formatDayMonthOrYear,
  formatDaySeries,
  formatWeekday,
  withoutFinalDot,
} from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

/** L'aide sous la case ; `warning` : le décalage ferait perdre une dose à cause de la date de fin. */
export type ShiftHelp = { text: string; warning: boolean }

const SHOWN_DAYS = 2

export type Carnet = {
  treatment: Pick<TreatmentWithPeriods, 'periods' | 'doses'>
  reading: TreatmentReading
  today: string
}

export const laterOf = (a: string, b: string): string => (a > b ? a : b)

/** L'aide sous la case : où vont les doses suivantes, ou la dose perdue par la date de fin. */
export function shiftHelpText(
  t: Translate,
  period: Pick<TreatmentPeriodRecord, 'frequency'>,
  {
    shifts,
    following,
    lost,
    weekdayOn = null,
    arrivals = [],
  }: {
    shifts: boolean
    following: string[]
    lost: string[]
    /** Le jour qui nomme le rythme : l'ancrage du décalage, sinon une dose qui n'est pas un report. */
    weekdayOn?: string | null
    /** Jours d'arrivée des reports : une dose reportée est nommée à part. */
    arrivals?: readonly string[]
  },
  today: string,
): ShiftHelp | null {
  if (shifts && lost.length > 0) {
    const dates = formatDaySeries(lost)
    return { text: t('treatments.shift.lost', { dates }, lost.length), warning: true }
  }
  const shown = following.slice(0, SHOWN_DAYS)
  const [first] = shown
  if (first === undefined) return null
  const way = shifts ? 'moved' : 'kept'
  const { unit, value } = period.frequency
  const [, second] = shown
  const every = t(`treatments.sheet.frequency.${unit}`, { n: value }, value)
  const day = (date: string) => formatDayMonthOrYear(date, today)
  if (second !== undefined && arrivals.includes(first)) {
    const named = { report: day(first), date: day(second), every }
    const text = shifts
      ? t('treatments.shift.movedAfterReport', named)
      : t('treatments.shift.keptAfterReport', named)
    return { text, warning: false }
  }
  if (second !== undefined && arrivals.includes(second)) {
    const named = { date: day(first), report: withoutFinalDot(day(second)) }
    const text = shifts
      ? t('treatments.shift.movedBeforeReport', named)
      : t('treatments.shift.keptBeforeReport', named)
    return { text, warning: false }
  }
  const weekday = formatWeekday(weekdayOn ?? first)
  if (unit === 'week' && shown.every((day) => formatWeekday(day) === weekday)) {
    const named = { weekday, dates: withoutFinalDot(formatDaySeries(shown)) }
    return { text: t(`treatments.shift.${way}.weekly`, named), warning: false }
  }
  const date = formatDayMonthOrYear(first, today)
  return { text: t(`treatments.shift.${way}.every`, { date, every }), warning: false }
}

export function refusalHelp(t: Translate, refusal: Refusal, today: string): ShiftHelp {
  return { text: refusalText(t, refusal, today), warning: true }
}

/** Les journées encore à donner à partir de `from`, jusqu'à la date de fin s'il y en a une. */
function followingDays(
  view: ReturnType<typeof treatmentView>,
  period: Pick<TreatmentPeriodRecord, 'endsOn' | 'times'>,
  from: string,
): string[] {
  const perDay = Math.max(1, period.times.length)
  const limit = period.endsOn === null ? (SHOWN_DAYS + 2) * perDay : 5000
  return [...new Set(view.upcoming({ from, limit }).map(({ dueOn }) => dueOn))].sort()
}

export type GestureHelp = {
  outcome: GestureOutcome
  settingId: string
  newDay: string
  shifts: boolean
}

// La phrase des doses suivantes nomme un report : « Dose reportée le … ».
function namesReport(
  { shifts, following, lost }: { shifts: boolean; following: string[]; lost: string[] },
  arrivals: ReadonlySet<string>,
): boolean {
  if (shifts && lost.length > 0) return false
  const [first, second] = following
  return second !== undefined && (arrivals.has(first!) || arrivals.has(second))
}

// R12 : l'aide se lit sur la vue que le geste laisserait, jamais sur un calendrier recalculé ici.
export function suiteHelpOf(
  t: Translate,
  { treatment, reading, today }: Carnet,
  { outcome, settingId, newDay, shifts }: GestureHelp,
): { help: ShiftHelp | null; namesReport: boolean } {
  const period = treatment.periods.find(({ id }) => id === settingId)
  if (period === undefined) return { help: null, namesReport: false }
  const after = treatmentView(applied(reading.input, outcome.changes))
  const following = followingDays(after, period, laterOf(nextDay(newDay), today))
  const lost = shifts ? outcome.lostToEnd : []
  const arrivals = new Set(
    after.history.flatMap(({ effect }) =>
      effect.kind === 'moves' && effect.arrival !== null ? [effect.arrival] : [],
    ),
  )
  const weekdayOn = shifts ? newDay : (following.find((day) => !arrivals.has(day)) ?? null)
  const help = shiftHelpText(
    t,
    period,
    { shifts, following, lost, weekdayOn, arrivals: [...arrivals] },
    today,
  )
  const named = namesReport({ shifts, following, lost }, arrivals)
  const revealed = revealedDuesText(t, revealedDues(reading.view, after, today), 'help')
  if (revealed === null) return { help, namesReport: named }
  const text = help === null ? revealed : `${help.text} ${revealed}`
  return { help: { text, warning: help?.warning ?? false }, namesReport: named }
}
