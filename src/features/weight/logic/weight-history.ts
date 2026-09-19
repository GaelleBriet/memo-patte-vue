import { weightSummary, type WeightPoint } from './weight-summary'

export type WeightHistoryEntry = WeightPoint & { id: string }

export type WeightTrend = 'up' | 'down' | 'flat'

/** H1 : au moins deux pesées ; H2 : une seule ; H3 : aucune. */
export type WeightHistoryState = 'full' | 'single' | 'empty'

/** Ligne « Poids actuel » : `+0,5 kg vs août`, `Première pesée · 8 nov. 2026` ou `±0,0 kg`. */
export type WeightHeadline =
  | { kind: 'first'; measuredOn: string }
  | { kind: 'vs'; deltaKg: number; trend: 'up' | 'down'; previousMeasuredOn: string }
  | { kind: 'flat' }

export type WeightHistoryRow = WeightHistoryEntry & {
  /** `null` pour la toute première pesée : la cellule reste vide. */
  delta: { deltaKg: number; trend: WeightTrend } | null
}

export type WeightHistory = {
  state: WeightHistoryState
  current: WeightPoint | null
  headline: WeightHeadline | null
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
  return { deltaKg: summary.delta.deltaKg, trend: summary.delta.trend }
}

function headlineOf(entries: readonly WeightHistoryEntry[]): WeightHeadline | null {
  const summary = weightSummary(entries)
  if (!summary) return null
  const { delta } = summary
  if (delta.kind === 'first') return delta
  if (delta.trend === 'flat') return { kind: 'flat' }
  return {
    kind: 'vs',
    deltaKg: delta.deltaKg,
    trend: delta.trend,
    previousMeasuredOn: delta.previousMeasuredOn,
  }
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

  return {
    state: entries.length === 0 ? 'empty' : entries.length === 1 ? 'single' : 'full',
    current: weightSummary(entries)?.latest ?? null,
    headline: headlineOf(entries),
    rows,
    initialWeightKg,
  }
}
