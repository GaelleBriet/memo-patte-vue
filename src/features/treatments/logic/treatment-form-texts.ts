import type { EditionDraft, NextDoseHelp } from './treatment-edition'
import { nextDoseRefusalKey } from './treatment-form'
import type { Translate } from './treatment-gestures'
import type { ResumptionDraft } from './treatment-resumption'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'
import { formatDayMonthOrYear, formatFullDayMonth, withoutFinalDot } from '@/shared/utils/format'

type Previous = Pick<ResumptionDraft, 'startedOn' | 'endedOn' | 'durationDays' | 'earliestOn'>

/** Le texte sous la date de « Prochaine dose ». */
export function nextDoseHelpText(t: Translate, help: NextDoseHelp | null, today: string) {
  if (help === null) return null
  switch (help.kind) {
    case 'refused':
      return t(nextDoseRefusalKey(help.refusal))
    case 'dropped':
      return t('treatments.form.nextDoseOn.dropped', { n: help.count }, help.count)
    case 'overdue':
      return t('treatments.form.nextDoseOn.overdue', {
        date: formatDayMonthOrYear(help.since, today),
      })
    case 'today':
      return t('treatments.form.nextDoseOn.today')
    case 'scheduled':
      return t('treatments.form.nextDoseOn.scheduled', {
        date: withoutFinalDot(formatDayMonthOrYear(help.on, today)),
      })
    case 'calculated-passed':
      return t('treatments.form.nextDoseOn.calculatedPassed', {
        date: formatDayMonthOrYear(help.on, today),
      })
    case 'calculated':
      return t('treatments.form.nextDoseOn.calculated', {
        date: withoutFinalDot(formatDayMonthOrYear(help.on, today)),
      })
  }
  return null
}

/** « Reprendre » : les dates de la période précédente. */
export function resumeInfoText(t: Translate, previous: Previous | null, today: string) {
  if (previous === null || previous.endedOn === null) return null
  return t('treatments.form.resumeInfo', {
    start: formatDayMonthOrYear(previous.startedOn, today),
    end: withoutFinalDot(formatDayMonthOrYear(previous.endedOn, today)),
  })
}

/** L'aide de la date de fin : la durée de la période reprise, tant que la date n'est pas touchée. */
export function endsOnHelpText(
  t: Translate,
  previous: Previous | null,
  { endsOn, touched }: { endsOn: string; touched: boolean },
): string {
  const days = previous?.durationDays ?? null
  if (days === null || touched) return t('treatments.form.endsOn.help')
  const duration = t('treatments.form.endsOn.days', { n: days }, days)
  return endsOn === ''
    ? t('treatments.form.endsOn.sameDuration', { duration })
    : t('treatments.form.endsOn.repeatedDuration', { duration })
}

/** Les valeurs que les messages d'erreur du formulaire citent. */
export function formErrorParams(
  draft: Pick<EditionDraft, 'nextDose' | 'farthestMove'> | null,
  previous: Previous | null,
  today: string,
): Record<string, unknown> {
  const next = draft?.nextDose ?? null
  const farthest = draft?.farthestMove ?? null
  return {
    max: MAX_NAME_LENGTH,
    date: next ? formatFullDayMonth(next.earliest) : '',
    latest: next?.latest ? formatFullDayMonth(next.latest) : '',
    from: previous ? withoutFinalDot(formatDayMonthOrYear(previous.earliestOn, today)) : '',
    arrival: farthest ? withoutFinalDot(formatDayMonthOrYear(farthest.arrivesOn, today)) : '',
  }
}

/** Le nombre qui accorde le nom de l'unité de fréquence : 1 tant que la saisie n'en est pas un. */
export function frequencyUnitCount(frequencyValue: string): number {
  const count = Number(frequencyValue)
  return Number.isInteger(count) && count > 0 ? count : 1
}
