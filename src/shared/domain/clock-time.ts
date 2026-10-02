/** Heure locale `HH:mm`, sur 24 h. */
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function isClockTime(time: unknown): time is string {
  return typeof time === 'string' && CLOCK_TIME_PATTERN.test(time)
}
