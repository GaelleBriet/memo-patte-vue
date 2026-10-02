import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { dosageText } from '@/shared/domain/dosage'
import { formatClockTimes, formatDayMonthOrYear } from '@/shared/utils/format'

type Translate = (key: string, named: Record<string, unknown>, plural: number) => string

const SEPARATOR = ' · '

function frequencyAndTimes(
  t: Translate,
  { frequency, times }: Pick<TreatmentPeriodRecord, 'frequency' | 'times'>,
): string[] {
  const text = t(`treatments.frequency.${frequency.unit}`, { n: frequency.value }, frequency.value)
  return times.length === 0 ? [text] : [text, formatClockTimes(times)]
}

/** `Tous les jours · 20 h · jusqu’au 10 oct.` : la ligne de fréquence de la fiche. */
export function periodRhythmText(
  t: Translate,
  period: Pick<TreatmentPeriodRecord, 'frequency' | 'times' | 'endsOn'>,
  today: string,
): string {
  const until =
    period.endsOn === null
      ? []
      : [t('treatments.rhythm.until', { date: formatDayMonthOrYear(period.endsOn, today) }, 1)]
  return [...frequencyAndTimes(t, period), ...until].join(SEPARATOR)
}

/** `Tous les jours · 8 h et 20 h · 0,3 ml` : les réglages d'une période, en tête de son historique. */
export function periodSettingsText(
  t: Translate,
  period: Pick<TreatmentPeriodRecord, 'frequency' | 'times' | 'doseQuantity' | 'doseUnit'>,
): string {
  const dosage = dosageText(t, period)
  return [...frequencyAndTimes(t, period), ...(dosage === null ? [] : [dosage])].join(SEPARATOR)
}
