import type { WeightUnit } from './weight-unit'
import { shownWeight, withWeightUnit } from './weight-display'
import { formatDayMonthOrYear, formatWeightDelta } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export type WeightTrend = 'up' | 'down' | 'flat'

/** Deux pesées successives, en kg tels qu'enregistrés. */
export type WeightChange = { previousKg: number; latestKg: number; previousMeasuredOn: string }

type WeightPair = Pick<WeightChange, 'previousKg' | 'latestKg'>

/** Écart des deux poids tels qu'ils s'affichent : les variations lues s'additionnent. */
export function shownWeightDelta(unit: WeightUnit, { previousKg, latestKg }: WeightPair): number {
  return Math.round((shownWeight(unit, latestKg) - shownWeight(unit, previousKg)) * 10) / 10
}

/** Sens de la variation affichée : `flat` quand elle s'écrit `±0,0`. */
export function weightTrend(unit: WeightUnit, pair: WeightPair): WeightTrend {
  const delta = shownWeightDelta(unit, pair)
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

/** `+0,3 kg`, `±0,0 lb` : la variation seule, dans l'unité choisie. */
export function weightDeltaText(t: Translate, unit: WeightUnit, pair: WeightPair): string {
  return withWeightUnit(t, unit, formatWeightDelta(shownWeightDelta(unit, pair)))
}

/** `+0,3 kg depuis le 25 août`, `depuis le 20 déc. 2025` hors de l'année de `today`. */
export function weightDeltaSinceText(
  t: Translate,
  unit: WeightUnit,
  change: WeightChange,
  today: string,
): string {
  return t('weight.delta.since', {
    delta: weightDeltaText(t, unit, change),
    date: formatDayMonthOrYear(change.previousMeasuredOn, today),
  })
}
