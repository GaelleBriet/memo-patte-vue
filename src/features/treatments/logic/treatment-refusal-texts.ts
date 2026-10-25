import type { Refusal } from '@/shared/domain/dose-calendar'
import { formatDayMonthOrYear, withoutFinalDot } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

const KEYS = {
  'later-dose': 'treatments.history.refusal.shiftLaterDose',
  'later-line': 'treatments.form.nextDoseOn.refusal.laterLine',
  'no-date-left': 'treatments.form.nextDoseOn.refusal.noDateLeft',
  'no-dose-before-end': 'treatments.form.nextDoseOn.refusal.noDoseBeforeEnd',
  'arrival-logged': 'treatments.form.nextDoseOn.refusal.arrivalLogged',
  'report-loop': 'treatments.history.refusal.shiftMovePastNext',
  'report-past-next': 'treatments.history.refusal.shiftMovePastNext',
} as const

/** Le texte existant de chaque refus du moteur ; « Cette dose ne peut pas être déplacée. » à défaut. */
export function refusalText(t: Translate, refusal: Refusal, today: string): string {
  switch (refusal.reason) {
    case 'stuck-report':
      return t('treatments.shift.stuckMove', {
        date: formatDayMonthOrYear(refusal.on, today),
      })
    case 'arrival-shared':
      return t('treatments.history.refusal.arrivalShared', {
        date: withoutFinalDot(formatDayMonthOrYear(refusal.on, today)),
      })
    case 'report-off-rhythm':
      return t('treatments.history.refusal.shiftMoveOffRhythm', {
        date: withoutFinalDot(formatDayMonthOrYear(refusal.on, today)),
      })
    case 'later-dose':
    case 'later-line':
    case 'no-date-left':
    case 'no-dose-before-end':
    case 'arrival-logged':
    case 'report-loop':
    case 'report-past-next':
      return t(KEYS[refusal.reason])
    default:
      return t('treatments.form.errors.nextDoseOnRefused')
  }
}

export function removeMoveRefusalText(t: Translate, refusal: Refusal, today: string): string {
  return refusal.reason === 'later-line'
    ? t('treatments.history.refusal.removeMoveLaterLine')
    : refusalText(t, refusal, today)
}
