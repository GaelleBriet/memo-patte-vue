import { formatKg, formatMonthShort } from './format'

export type WeightChartEntry = { weightKg: number; measuredOn: string }

export type WeightChartPoint = {
  x: number
  y: number
  valueLabel: string
  monthLabel: string
}

export type WeightChart = {
  width: number
  height: number
  points: WeightChartPoint[]
  polyline: string
}

export type WeightChartOptions = {
  width?: number
  height?: number
  /** Marge au-dessus du max et au-dessous du min : l'échelle ne part jamais de zéro. */
  marginKg?: number
  paddingX?: number
  /** Réserve la place de la valeur écrite au-dessus du point le plus haut. */
  paddingTop?: number
  paddingBottom?: number
}

const DEFAULTS: Required<WeightChartOptions> = {
  width: 300,
  height: 120,
  marginKg: 0.3,
  paddingX: 16,
  paddingTop: 18,
  paddingBottom: 8,
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** `null` sous deux pesées : une courbe à un point ne dit rien. Les pesées arrivent dans l'ordre du temps. */
export function buildWeightChart(
  entries: readonly WeightChartEntry[],
  options: WeightChartOptions = {},
): WeightChart | null {
  if (entries.length < 2) return null

  const { width, height, marginKg, paddingX, paddingTop, paddingBottom } = {
    ...DEFAULTS,
    ...options,
  }
  const weights = entries.map((entry) => entry.weightKg)
  const low = Math.min(...weights) - marginKg
  const high = Math.max(...weights) + marginKg
  const usableWidth = width - 2 * paddingX
  const usableHeight = height - paddingTop - paddingBottom
  const bottom = height - paddingBottom
  const lastIndex = entries.length - 1

  const points = entries.map((entry, index) => ({
    x: round(paddingX + (usableWidth * index) / lastIndex),
    y: round(bottom - ((entry.weightKg - low) / (high - low)) * usableHeight),
    valueLabel: formatKg(entry.weightKg),
    monthLabel: formatMonthShort(entry.measuredOn),
  }))

  return {
    width,
    height,
    points,
    polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
  }
}
