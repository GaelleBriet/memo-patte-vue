import { addDays, differenceInCalendarDays, format, parseISO, sub } from 'date-fns'

import { notifiedDues, type Translate } from './treatment-other-date'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { NotifiedDue } from '@/shared/domain/reminder-route'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { formatClockTime, formatFullDate, formatWeekdayDayMonth } from '@/shared/utils/format'

/**
 * `note` : notification du jour, son échéance se note d'un tap ; `given-when` : « Donnée quand ? » ;
 * `already` : échéance déjà donnée (Q33) ; `sheet` : oubli (Q41) ou échéance qui n'est plus prévue ;
 * `none` : le traitement n'a plus de dose à noter.
 */
export type NotificationTarget =
  | { kind: 'note'; due: Due }
  | { kind: 'given-when' }
  | { kind: 'already'; givenOn: string }
  | { kind: 'sheet' }
  | { kind: 'none' }

type NotifiedSchedule = Pick<
  TreatmentSchedule,
  'doses' | 'unloggedDoses' | 'currentDoses' | 'finished'
>

/** Ce que fait « C'est fait » d'une notification, d'après le moteur d'échéances. */
export function notificationTarget(
  schedule: NotifiedSchedule,
  notified: NotifiedDue,
  today: string,
): NotificationTarget {
  const dues = notifiedDues(schedule, notified)
  if (dues.length === 0 || notified.dueOn > today) {
    return schedule.finished ? { kind: 'none' } : { kind: 'sheet' }
  }
  const pending = dues.filter(({ status }) => status === 'pending')
  if (pending.length === 0) {
    const given = dues.find(({ status }) => status === 'given')
    return given === undefined
      ? { kind: 'sheet' }
      : { kind: 'already', givenOn: given.givenOn ?? notified.dueOn }
  }
  const [only] = pending
  if (notified.dueOn === today && dues.length === 1 && only !== undefined) {
    return { kind: 'note', due: only.due }
  }
  return { kind: 'given-when' }
}

/** Q3 : un traitement de tous les jours ne demande que « Donnée le {jour prévu} ». */
export function isEveryDay({ frequency }: Pick<TreatmentPeriodRecord, 'frequency'>): boolean {
  return frequency.value === 1 && frequency.unit === 'day'
}

function isExtraOn(schedule: Pick<TreatmentSchedule, 'doseFor'>, due: Due, givenOn: string) {
  try {
    return schedule.doseFor({ kind: 'given', due, givenOn }).dose.status === 'extra'
  } catch (cause) {
    if (cause instanceof RangeError) return true
    throw cause
  }
}

function day(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Premier jour où une prise note encore cette échéance : avant, elle serait une prise en plus (G11) ;
 * `null` : pas de borne.
 */
export function earliestGivenOn(
  schedule: Pick<TreatmentSchedule, 'doseFor'>,
  { frequency }: Pick<TreatmentPeriodRecord, 'frequency'>,
  due: Due,
): string | null {
  const steps = { day: 'days', week: 'weeks', month: 'months' } as const
  let low = day(sub(parseISO(due.dueOn), { [steps[frequency.unit]]: frequency.value, days: 1 }))
  if (!isExtraOn(schedule, due, low)) return null
  let high = due.dueOn
  let gap = differenceInCalendarDays(parseISO(high), parseISO(low))
  while (gap > 1) {
    const middle = day(addDays(parseISO(low), Math.floor(gap / 2)))
    if (isExtraOn(schedule, due, middle)) low = middle
    else high = middle
    gap = differenceInCalendarDays(parseISO(high), parseISO(low))
  }
  return high
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type GivenWhenTexts = {
  subtitle: string
  scheduled: { label: string; detail: string; aria: string }
  today: { label: string; detail: string; aria: string }
  other: { label: string; aria: string }
  everyDay: { label: string; aria: string }
}

/** Textes de « Donnée quand ? » (V5) ; `dueTime` `null` : sans heure, ou toute la journée. */
export function givenWhenTexts(
  t: Translate,
  { name, animal, today }: { name: string; animal: string; today: string },
  { dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>,
): GivenWhenTexts {
  const date = formatWeekdayDayMonth(dueOn)
  const full = formatFullDate(dueOn)
  const time = dueTime === null ? null : formatClockTime(dueTime)
  const named = { name, animal, date }
  return {
    subtitle:
      time === null
        ? t('treatments.givenWhen.subtitle', named)
        : t('treatments.givenWhen.subtitleAt', { ...named, time }),
    scheduled: {
      label: capitalized(date),
      detail:
        time === null
          ? t('treatments.givenWhen.scheduled')
          : t('treatments.givenWhen.scheduledAt', { time }),
      aria:
        time === null
          ? t('treatments.givenWhen.scheduledLabel', { date: full })
          : t('treatments.givenWhen.scheduledLabelAt', { date: full, time }),
    },
    today: {
      label: t('treatments.givenWhen.today'),
      detail: capitalized(formatWeekdayDayMonth(today)),
      aria: t('treatments.givenWhen.todayLabel', { date: formatFullDate(today) }),
    },
    other: {
      label: t('treatments.givenWhen.other'),
      aria: t('treatments.givenWhen.otherLabel'),
    },
    everyDay: {
      label:
        time === null
          ? t('treatments.givenWhen.everyDay', { date })
          : t('treatments.givenWhen.everyDayAt', { date, time }),
      aria:
        time === null
          ? t('treatments.givenWhen.everyDayLabel', { date: full })
          : t('treatments.givenWhen.everyDayLabelAt', { date: full, time }),
    },
  }
}
