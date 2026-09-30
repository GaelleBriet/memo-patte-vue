import { weightTrend, type WeightChange, type WeightTrend } from '@/shared/domain/weight-delta'

export type WeightPoint = { weightKg: number; measuredOn: string }

export type WeightDelta =
  { kind: 'first'; measuredOn: string } | ({ kind: 'delta'; trend: WeightTrend } & WeightChange)

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

  const change: WeightChange = {
    previousKg: previous.weightKg,
    latestKg: latest.weightKg,
    previousMeasuredOn: previous.measuredOn,
  }
  return {
    latest: { weightKg: latest.weightKg, measuredOn: latest.measuredOn },
    delta: { kind: 'delta', ...change, trend: weightTrend(change) },
  }
}
