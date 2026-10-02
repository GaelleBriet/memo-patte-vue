import { addDays, format, parseISO } from 'date-fns'

import type { Due, TreatmentPhase } from './treatment-schedule'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'

type Translate = (key: string, named: Record<string, unknown>) => string

/** `label` : `null` pour une dose en retard ; `value` : `null` pour un traitement fini sans date à dire. */
export type CurrentDoseText = { label: string | null; value: string | null }

export type CurrentDose = {
  phase: TreatmentPhase
  /** Une des doses du moment ; `null` quand le traitement est fini ou arrêté. */
  due: Due | null
  today: string
  stoppedOn?: string | null
  /** Date de fin de la période en cours ; dite une fois atteinte. */
  endsOn?: string | null
}

function dueDay(t: Translate, { dueOn, dueTime }: Due, today: string): string {
  const date = formatDayMonthOrYear(dueOn, today)
  return dueTime === null ? date : t('currentDose.at', { date, time: formatClockTime(dueTime) })
}

function isTomorrow(day: string, today: string): boolean {
  return day === format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
}

/** Libellé et valeur de la carte de la dose du moment : « Dose du jour » · « 28 sept. à 20 h ». */
export function currentDoseText(
  t: Translate,
  { phase, due, today, stoppedOn = null, endsOn = null }: CurrentDose,
): CurrentDoseText {
  if (phase === 'stopped' || phase === 'ended' || due === null) {
    const day = (date: string) => formatDayMonthOrYear(date, today)
    const value =
      phase === 'stopped' && stoppedOn !== null
        ? t('currentDose.stoppedOn', { date: day(stoppedOn) })
        : phase === 'ended' && endsOn !== null && endsOn <= today
          ? t('currentDose.endedOn', { date: day(endsOn) })
          : null
    return { label: t('currentDose.label.end', {}), value }
  }
  const day = dueDay(t, due, today)
  if (phase === 'today') return { label: t('currentDose.label.today', {}), value: day }
  if (phase === 'overdue') {
    return { label: null, value: t('currentDose.overdueSince', { date: day }) }
  }
  return {
    label: t('currentDose.label.upcoming', {}),
    value: isTomorrow(due.dueOn, today) ? t('currentDose.tomorrow', { date: day }) : day,
  }
}

/** `Aujourd’hui · 8 h` : une échéance du jour garde son heure, même passée. */
export function dueTodayText(t: Translate, { dueTime }: Pick<Due, 'dueTime'>): string {
  return dueTime === null
    ? t('currentDose.today', {})
    : t('currentDose.todayAt', { time: formatClockTime(dueTime) })
}
