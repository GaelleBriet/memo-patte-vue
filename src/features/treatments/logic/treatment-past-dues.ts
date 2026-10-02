import type { PastDuesChoice } from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Due } from '@/shared/domain/treatment-schedule'
import {
  formatClockTimes,
  formatDayList,
  formatDayMonth,
  formatDayRange,
  withoutFinalDot,
} from '@/shared/utils/format'

type Translate = (key: string, named: Record<string, unknown>, plural: number) => string

export type PastDuesTexts = {
  title: string
  text: string
  keep: string
  keepHint: string
  drop: string
  dropHint: string
  cancel: string
}

const MAX_LISTED_DAYS = 3

function sentenceDate(day: string): string {
  return withoutFinalDot(formatDayMonth(day))
}

function rhythmText(
  t: Translate,
  { frequency, times }: Pick<TreatmentPeriodRecord, 'frequency' | 'times'>,
) {
  const text = t(`treatments.frequency.${frequency.unit}`, { n: frequency.value }, frequency.value)
  const lower = text.charAt(0).toLocaleLowerCase() + text.slice(1)
  return times.length === 0 ? lower : `${lower} · ${formatClockTimes(times)}`
}

function datesText(t: Translate, days: readonly string[], rhythm: string): string {
  const [first] = days
  const last = days.at(-1)
  if (first === undefined || last === undefined) return ''
  if (days.length === 1) {
    return t('treatments.form.pastDues.text.one', { date: formatDayMonth(first), rhythm }, 1)
  }
  if (days.length <= MAX_LISTED_DAYS) {
    return t('treatments.form.pastDues.text.list', { dates: formatDayList(days), rhythm }, 1)
  }
  return t('treatments.form.pastDues.text.range', { ...formatDayRange(first, last), rhythm }, 1)
}

/**
 * Les textes de la question posée avant d'enregistrer : `dues` vient du moteur, `period` porte
 * l'ancien rythme, `nextDose` la première échéance que chaque réponse écrirait.
 */
export function pastDuesTexts(
  t: Translate,
  dues: readonly Due[],
  period: Pick<TreatmentPeriodRecord, 'frequency' | 'times'>,
  nextDose: Record<PastDuesChoice, string>,
): PastDuesTexts {
  const count = dues.length
  const days = [...new Set(dues.map(({ dueOn }) => dueOn))].sort()
  return {
    title: t('treatments.form.pastDues.title', { n: count }, count),
    text: datesText(t, days, rhythmText(t, period)),
    keep: t('treatments.form.pastDues.keep', {}, count),
    keepHint: t('treatments.form.pastDues.keepHint', { date: sentenceDate(nextDose.keep) }, 1),
    drop: t('treatments.form.pastDues.drop', {}, count),
    dropHint: t('treatments.form.pastDues.dropHint', { date: sentenceDate(nextDose.drop) }, 1),
    cancel: t('treatments.form.pastDues.cancel', {}, 1),
  }
}
