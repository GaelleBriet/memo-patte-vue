import { weightSummary, type WeightDelta, type WeightPoint } from './weight-summary'
import type { WeightChange, WeightTrend } from '@/shared/domain/weight-delta'

export type WeightHistoryEntry = WeightPoint & { id: string }

/** H1 : au moins deux pesées ; H2 : une seule ; H3 : aucune. */
export type WeightHistoryState = 'full' | 'single' | 'empty'

export type WeightHistoryRow = WeightHistoryEntry & {
  /** `null` pour la toute première pesée : la cellule reste vide. */
  delta: (WeightChange & { trend: WeightTrend }) | null
}

export type WeightHistory = {
  state: WeightHistoryState
  current: WeightPoint | null
  /** Ligne « Poids actuel » : sa variation depuis la pesée précédente, ou la première pesée. */
  headline: WeightDelta | null
  /** La plus récente en haut. */
  rows: WeightHistoryRow[]
  /** Donnée de l'animal, sans date : jamais une pesée ni un point de courbe. */
  initialWeightKg: number | null
}

function rowDelta(
  previous: WeightHistoryEntry | undefined,
  entry: WeightHistoryEntry,
): WeightHistoryRow['delta'] {
  if (!previous) return null
  const summary = weightSummary([previous, entry])
  if (summary?.delta.kind !== 'delta') return null
  const { previousKg, latestKg, trend, previousMeasuredOn } = summary.delta
  return { previousKg, latestKg, trend, previousMeasuredOn }
}

/** Les pesées arrivent dans l'ordre du temps, comme les rend le store. */
export function weightHistory(
  entries: readonly WeightHistoryEntry[],
  initialWeightKg: number | null,
): WeightHistory {
  const rows = entries
    .map((entry, index) => ({
      id: entry.id,
      weightKg: entry.weightKg,
      measuredOn: entry.measuredOn,
      delta: rowDelta(entries[index - 1], entry),
    }))
    .reverse()

  const summary = weightSummary(entries)

  return {
    state: entries.length === 0 ? 'empty' : entries.length === 1 ? 'single' : 'full',
    current: summary?.latest ?? null,
    headline: summary?.delta ?? null,
    rows,
    initialWeightKg,
  }
}
