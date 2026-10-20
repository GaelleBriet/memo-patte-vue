import { z } from 'zod'

import { MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR } from './calendar-day'

function isYearInRange(value: string): boolean {
  const year = Number(value.slice(0, 4))
  return year >= MIN_CALENDAR_YEAR && year <= MAX_CALENDAR_YEAR
}

/**
 * Instant UTC d'un fichier ou d'une colonne, entre 1900 et 2199, rendu en `toISOString()` : la
 * synchronisation compare les instants comme des chaînes.
 */
export const instantSchema = z.iso
  .datetime()
  .or(z.iso.datetime({ precision: -1 }))
  .refine(isYearInRange)
  .transform((value) => new Date(value).toISOString())
