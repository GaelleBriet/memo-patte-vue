import type { Translate } from './due-reminders'
import { formatDayMonthOrYear, formatKgDelta, nonBreaking } from '@/shared/utils/format'

/** `+0,3 kg`, `±0,0 kg` : la variation seule. */
export function weightDeltaText(t: Translate, deltaKg: number): string {
  return t('weight.delta.value', { delta: formatKgDelta(deltaKg) })
}

/** `+0,3 kg depuis le 25 août`, `depuis le 20 déc. 2025` hors de l'année de `today`. */
export function weightDeltaSinceText(
  t: Translate,
  deltaKg: number,
  previousMeasuredOn: string,
  today: string,
): string {
  return t('weight.delta.since', {
    delta: formatKgDelta(deltaKg),
    date: nonBreaking(formatDayMonthOrYear(previousMeasuredOn, today)),
  })
}
