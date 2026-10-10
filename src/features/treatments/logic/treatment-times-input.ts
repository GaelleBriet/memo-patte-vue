import { isClockTime, MAX_TIMES_PER_DAY, sortedTimes } from '@/shared/domain/clock-time'

export function canAddTime(times: readonly string[]): boolean {
  return times.length < MAX_TIMES_PER_DAY
}

/** Heures dans l'ordre de la journée ; une heure illisible, déjà présente ou de trop ne change rien. */
export function withTime(times: readonly string[], time: string): string[] {
  if (!isClockTime(time) || times.includes(time) || !canAddTime(times)) return [...times]
  return sortedTimes([...times, time])
}

export function withoutTime(times: readonly string[], time: string): string[] {
  return times.filter((other) => other !== time)
}

/** L'heure est déjà celle d'une autre puce que `except`. */
export function isTimeTaken(times: readonly string[], time: string, except?: string): boolean {
  return time !== except && times.includes(time)
}

/** Une heure illisible ou déjà prise ne change rien. */
export function withTimeChanged(times: readonly string[], previous: string, time: string) {
  if (!isClockTime(time) || isTimeTaken(times, time, previous)) return [...times]
  return withTime(withoutTime(times, previous), time)
}
