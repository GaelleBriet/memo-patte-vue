export const MIN_CALENDAR_YEAR = 1900
export const MAX_CALENDAR_YEAR = 2199

/** Date civile `yyyy-MM-dd` qui existe, entre 1900 et 2199 : au-delà, la saisie ou le fichier est faux. */
export function isCalendarDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  const date = Number(day.slice(8, 10))
  if (year < MIN_CALENDAR_YEAR || year > MAX_CALENDAR_YEAR) return false
  const parsed = new Date(year, month - 1, date)
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === date
  )
}
