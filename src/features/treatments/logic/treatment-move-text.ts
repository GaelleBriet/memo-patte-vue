import type { TreatmentDose } from '../schema/treatment-dose.schema'
import { isAdvanced } from '@/shared/domain/dose-calendar'
import { formatDayMonthOrYear, formatLongDate } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export function moveText(
  t: Translate,
  dose: Pick<TreatmentDose, 'status' | 'dueOn' | 'targetOn'>,
): string {
  const arrival = dose.targetOn ?? dose.dueOn
  const dates = {
    date: formatLongDate(arrival),
    due: formatDayMonthOrYear(dose.dueOn, arrival),
  }
  return isAdvanced(dose)
    ? t('treatments.history.advanced', dates)
    : t('treatments.history.postponed', dates)
}
