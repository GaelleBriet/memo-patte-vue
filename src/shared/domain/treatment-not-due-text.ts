import { toDay } from './calendar-day'
import { formatLongDate } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

type Answered = { createdAt: string }

export function answeredOn({ createdAt }: Answered): string {
  return toDay(new Date(createdAt))
}

export function notDueTextOn(t: Translate, day: string): string {
  return t('treatments.history.notDue', { date: formatLongDate(day) })
}

export function notDueText(t: Translate, dose: Answered): string {
  return notDueTextOn(t, answeredOn(dose))
}
