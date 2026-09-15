import { format } from 'date-fns'

/** Date civile locale du jour, au format du champ date natif (`yyyy-MM-dd`). */
export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
