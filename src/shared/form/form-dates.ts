import { format } from 'date-fns'

/** Date du jour au format du champ date natif (`yyyy-MM-dd`), pour borner un sélecteur. */
export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
