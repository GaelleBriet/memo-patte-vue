import type { Translate } from './due-reminders'
import { displayedWeight, withWeightUnit } from './weight-display'
import { formatDayMonthOrYear, formatWeightDelta, nonBreaking } from '@/shared/utils/format'

export type WeightTrend = 'up' | 'down' | 'flat'

/** Sens de la variation telle qu'elle s'affiche : `flat` quand elle s'écrit `±0,0`. */
export function weightTrend(deltaKg: number): WeightTrend {
  const shown = Math.round(displayedWeight(deltaKg) * 10) / 10
  return shown > 0 ? 'up' : shown < 0 ? 'down' : 'flat'
}

/** `+0,3 kg`, `±0,0 lb` : la variation seule, dans l'unité choisie. */
export function weightDeltaText(t: Translate, deltaKg: number): string {
  return withWeightUnit(t, formatWeightDelta(displayedWeight(deltaKg)))
}

/** `+0,3 kg depuis le 25 août`, `depuis le 20 déc. 2025` hors de l'année de `today`. */
export function weightDeltaSinceText(
  t: Translate,
  deltaKg: number,
  previousMeasuredOn: string,
  today: string,
): string {
  return t('weight.delta.since', {
    delta: weightDeltaText(t, deltaKg),
    date: nonBreaking(formatDayMonthOrYear(previousMeasuredOn, today)),
  })
}
