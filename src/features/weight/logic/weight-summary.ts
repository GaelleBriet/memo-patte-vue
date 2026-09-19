export type WeightPoint = { weightKg: number; measuredOn: string }

export type WeightDelta =
  | { kind: 'first'; measuredOn: string }
  | { kind: 'delta'; deltaKg: number; trend: 'up' | 'down' | 'flat'; previousMeasuredOn: string }

export type WeightSummary = { latest: WeightPoint; delta: WeightDelta }

function roundToDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

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

  const deltaKg = roundToDecimal(latest.weightKg - previous.weightKg)
  return {
    latest: { weightKg: latest.weightKg, measuredOn: latest.measuredOn },
    delta: {
      kind: 'delta',
      deltaKg,
      trend: deltaKg > 0 ? 'up' : deltaKg < 0 ? 'down' : 'flat',
      previousMeasuredOn: previous.measuredOn,
    },
  }
}
