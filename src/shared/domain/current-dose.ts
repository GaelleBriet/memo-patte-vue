import { nextDay } from './calendar-day'
import type { Due, TreatmentPhase } from './treatment-schedule'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

/** `label` : `null` pour une dose en retard ; `value` : `null` pour un traitement fini sans date à dire. */
export type CurrentDoseText = { label: string | null; value: string | null }

export type CurrentDose = {
  phase: TreatmentPhase
  /** Une des doses du moment ; `null` quand le traitement est fini ou arrêté. */
  due: Due | null
  today: string
  stoppedOn?: string | null
  /** Aucune dose jamais due ni donnée : l'arrêt n'a pas de date à dire. */
  stoppedBeforeFirstDose?: boolean
  /** Date de fin de la période en cours ; dite une fois atteinte. */
  endsOn?: string | null
}

function dueDay(t: Translate, { dueOn, dueTime }: Due, today: string): string {
  const date = formatDayMonthOrYear(dueOn, today)
  return dueTime === null ? date : t('currentDose.at', { date, time: formatClockTime(dueTime) })
}

function isTomorrow(day: string, today: string): boolean {
  return day === nextDay(today)
}

/** Libellé et valeur de la carte de la dose du moment : « Dose du jour » · « 28 sept. à 20 h ». */
export function currentDoseText(
  t: Translate,
  {
    phase,
    due,
    today,
    stoppedOn = null,
    stoppedBeforeFirstDose = false,
    endsOn = null,
  }: CurrentDose,
): CurrentDoseText {
  if (phase === 'stopped' || phase === 'ended' || due === null) {
    const day = (date: string) => formatDayMonthOrYear(date, today)
    const value =
      phase === 'stopped' && stoppedOn !== null
        ? stoppedBeforeFirstDose
          ? t('currentDose.stoppedBeforeFirstDose', {})
          : t('currentDose.stoppedOn', { date: day(stoppedOn) })
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
