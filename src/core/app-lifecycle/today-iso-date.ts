import { toDay } from '@/shared/domain/calendar-day'

/** Date civile locale du jour, au format du champ date natif (`yyyy-MM-dd`). */
export function todayIsoDate(): string {
  return toDay(new Date())
}
