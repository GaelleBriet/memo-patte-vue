import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import { toDay } from '@/shared/domain/calendar-day'
import { formatLongDate } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

type Answered = Pick<NewTreatmentDose, 'createdAt'>

export function answeredOn({ createdAt }: Answered): string {
  return toDay(new Date(createdAt))
}

export function notDueText(t: Translate, dose: Answered): string {
  return t('treatments.history.notDue', { date: formatLongDate(answeredOn(dose)) })
}
