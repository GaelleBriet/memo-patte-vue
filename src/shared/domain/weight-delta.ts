import type { Translate } from './due-reminders'
import { shownWeight, withWeightUnit } from './weight-display'
import { formatDayMonthOrYear, formatWeightDelta, nonBreaking } from '@/shared/utils/format'

export type WeightTrend = 'up' | 'down' | 'flat'

/** Deux pesées successives, en kg tels qu'enregistrés. */
export type WeightChange = { previousKg: number; latestKg: number; previousMeasuredOn: string }

type WeightPair = Pick<WeightChange, 'previousKg' | 'latestKg'>

/** Écart des deux poids tels qu'ils s'affichent : les variations lues s'additionnent. */
export function shownWeightDelta({ previousKg, latestKg }: WeightPair): number {
  return Math.round((shownWeight(latestKg) - shownWeight(previousKg)) * 10) / 10
}

/** Sens de la variation affichée : `flat` quand elle s'écrit `±0,0`. */
export function weightTrend(pair: WeightPair): WeightTrend {
  const delta = shownWeightDelta(pair)
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

/** `+0,3 kg`, `±0,0 lb` : la variation seule, dans l'unité choisie. */
export function weightDeltaText(t: Translate, pair: WeightPair): string {
  return withWeightUnit(t, formatWeightDelta(shownWeightDelta(pair)))
}

/** `+0,3 kg depuis le 25 août`, `depuis le 20 déc. 2025` hors de l'année de `today`. */
export function weightDeltaSinceText(t: Translate, change: WeightChange, today: string): string {
  return t('weight.delta.since', {
    delta: weightDeltaText(t, change),
    date: nonBreaking(formatDayMonthOrYear(change.previousMeasuredOn, today)),
  })
}
