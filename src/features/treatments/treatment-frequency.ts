import { addDays, addMonths, addWeeks, format, parseISO } from 'date-fns'
import type { TreatmentFrequency } from './treatment.schema'

const DATE_FORMAT = 'yyyy-MM-dd'

/** Dates civiles (yyyy-MM-dd) ; `addMonths` cale sur le dernier jour du mois quand le jour n'existe pas. */
export function addFrequency(date: string, frequency: TreatmentFrequency): string {
  const start = parseISO(date)
  const end =
    frequency.unit === 'day'
      ? addDays(start, frequency.value)
      : frequency.unit === 'week'
        ? addWeeks(start, frequency.value)
        : addMonths(start, frequency.value)
  return format(end, DATE_FORMAT)
}
