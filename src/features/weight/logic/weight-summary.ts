import { weightTrend, type WeightTrend } from '@/shared/domain/weight-delta'

export type WeightPoint = { weightKg: number; measuredOn: string }

/** `deltaKg` est l'écart brut : il ne s'arrondit qu'une fois converti dans l'unité affichée. */
export type WeightDelta =
  | { kind: 'first'; measuredOn: string }
  | { kind: 'delta'; deltaKg: number; trend: WeightTrend; previousMeasuredOn: string }

export type WeightSummary = { latest: WeightPoint; delta: WeightDelta }

/** Pesées dans l'ordre du temps, la dernière étant la plus récente. */
export function weightSummary(entries: readonly WeightPoint[]): WeightSummary | null {
  const latest = entries[entries.length - 1]
  if (!latest) return null

  const previous = entries[entries.length - 2]
  if (!previous) {
    return {
      latest: { weightKg: latest.weightKg, measuredOn: latest.measuredOn },
      delta: { kind: 'first', measuredOn: latest.measuredOn },
    }
  }

  const deltaKg = latest.weightKg - previous.weightKg
  return {
    latest: { weightKg: latest.weightKg, measuredOn: latest.measuredOn },
    delta: {
      kind: 'delta',
      deltaKg,
      trend: weightTrend(deltaKg),
      previousMeasuredOn: previous.measuredOn,
    },
  }
}
