import { displayedWeight } from './weight-display'
import type { WeightUnit } from './weight-unit'
import { formatWeight, formatWeightAxis } from '../utils/format'
import {
  chartFont,
  LABEL_GAP,
  type ChartFont,
  type ChartLabel,
  type ChartMeasure,
  type ChartText,
} from './chart-text-measure'
import {
  extremeLabel,
  LATEST_HEIGHT,
  latestPill,
  type LatestPill,
  type Place,
} from './chart-labels'
import {
  round,
  timeChart,
  type Layout,
  type TimeChart,
  type WeightChartEntry,
} from './chart-time-axis'

export { CHART_FONT_PX } from './chart-text-measure'
export type {
  ChartAnchor,
  ChartBox,
  ChartLabel,
  ChartMeasure,
  ChartText,
} from './chart-text-measure'
export type { ChartMonth, ChartPlot, ChartPoint, WeightChartEntry } from './chart-time-axis'

export const DEFAULT_CHART_WIDTH = 320

export const CHART_POINT_RADIUS = 4

export const CHART_MONTH_TICK_LENGTH = 5

/** Libellés traduits par l'appelant : le calcul les mesure tels qu'ils seront écrits. */
export type CarnetChartLabels = {
  max: (weight: string) => string
  min: (weight: string) => string
  latest: (weight: string) => string
}

export type CarnetWeightChart = TimeChart & {
  max: ChartLabel | null
  min: ChartLabel | null
  latest: LatestPill
}

export type HistoryWeightChart = TimeChart & {
  gridLines: { y: number; label: ChartText }[]
}

const CARNET_LAYOUT: Layout = { height: 160, left: 8, right: 8, top: 34, bottom: 26 }
const HISTORY_LAYOUT: Layout = { height: 190, left: 36, right: 10, top: 12, bottom: 22 }

const CARNET_MARGIN = 0.3
const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]
const TICK_PADDING = 0.1
const MAX_TICKS = 5
const BASELINE_CLEARANCE = 2
const GAP_ABOVE_POINT = 8
const GAP_BELOW_POINT = 10
const GAP_BESIDE_POINT = 8
const GRID_LABEL_GAP = 8
const GRID_LABEL_BASELINE = 4

// 0,3 de l'unité, ou plus s'il le faut pour écrire « min » sous son point sans toucher la ligne de base.
function carnetLowMargin(min: number, high: number, font: ChartFont): number {
  const plotHeight = CARNET_LAYOUT.height - CARNET_LAYOUT.top - CARNET_LAYOUT.bottom
  // Le pixel de plus absorbe l'arrondi au dixième du point puis de son étiquette.
  const room = GAP_BELOW_POINT + font.ascent + font.descent + BASELINE_CLEARANCE + LABEL_GAP
  return Math.max(CARNET_MARGIN, (room * (high - min)) / (plotHeight - room))
}

/** Carnet : échelle min / max ± 0,3 de l'unité, seuls le plus haut, le plus bas et la dernière pesée écrits. */
export function buildCarnetWeightChart(
  unit: WeightUnit,
  entries: readonly WeightChartEntry[],
  labels: CarnetChartLabels,
  { width = DEFAULT_CHART_WIDTH, ...measure }: ChartMeasure = {},
): CarnetWeightChart | null {
  if (entries.length < 2) return null

  const font = chartFont(measure)
  const weights = entries.map((entry) => entry.weightKg)
  const maxKg = Math.max(...weights)
  const minKg = Math.min(...weights)
  const highest = displayedWeight(unit, maxKg)
  const lowest = displayedWeight(unit, minKg)
  const high = highest + CARNET_MARGIN
  const minWritten = entries[entries.length - 1]!.weightKg !== minKg
  const low = lowest - (minWritten ? carnetLowMargin(lowest, high, font) : CARNET_MARGIN)
  const { chart } = timeChart(entries, CARNET_LAYOUT, low, high, { width, font, unit })
  const last = chart.points[chart.points.length - 1]!
  const latest = latestPill(
    chart,
    labels.latest(formatWeight(displayedWeight(unit, last.weightKg))),
    font,
  )
  const obstacles = [latest.box, ...chart.months.map((month) => month.box)]

  const above = { dx: 0, dy: -(GAP_ABOVE_POINT + font.descent) }
  const below = { dx: 0, dy: GAP_BELOW_POINT + font.ascent }
  // Assez bas pour sortir de la pastille partout où la place au-dessus du point la touche.
  const clearOfLatest = { dx: 0, dy: LATEST_HEIGHT - GAP_ABOVE_POINT + font.ascent }
  const besideDy = (font.ascent - font.descent) / 2
  const toTheRight: Place = { dx: GAP_BESIDE_POINT, dy: besideDy, anchor: 'start' }
  const toTheLeft: Place = { dx: -GAP_BESIDE_POINT, dy: besideDy, anchor: 'end' }

  const max = extremeLabel(
    chart,
    maxKg,
    labels.max(formatWeight(highest)),
    [above, below, clearOfLatest],
    obstacles,
    font,
  )
  const min = extremeLabel(
    chart,
    minKg,
    labels.min(formatWeight(lowest)),
    [below, toTheRight, toTheLeft],
    max ? [...obstacles, max.box] : obstacles,
    font,
  )

  return { ...chart, max, min, latest }
}

/** Graduations rondes dans l'unité affichée encadrant les pesées : trois à cinq lignes, sauf au-delà du pas de 50. */
export function weightAxisTicks(min: number, max: number): number[] {
  const ticksFor = (step: number) => {
    // La division flottante rend 24,4 / 0,1 = 243,999… : sans tolérance, une graduation de trop.
    const low = Math.floor((min - TICK_PADDING) / step + 1e-9)
    const high = Math.ceil((max + TICK_PADDING) / step - 1e-9)
    return Array.from({ length: high - low + 1 }, (_, index) => round((low + index) * step))
  }

  for (const step of TICK_STEPS) {
    const ticks = ticksFor(step)
    if (ticks.length <= MAX_TICKS) return ticks
  }
  return ticksFor(TICK_STEPS[TICK_STEPS.length - 1]!)
}

/** Historique : repères ronds dans l'unité affichée, aucun chiffre sur les points ; une pesée seule se centre. */
export function buildHistoryWeightChart(
  unit: WeightUnit,
  entries: readonly WeightChartEntry[],
  { width = DEFAULT_CHART_WIDTH, ...measure }: ChartMeasure = {},
): HistoryWeightChart | null {
  if (entries.length === 0) return null

  const weights = entries.map((entry) => displayedWeight(unit, entry.weightKg))
  const ticks = weightAxisTicks(Math.min(...weights), Math.max(...weights))
  const { chart, yOf } = timeChart(entries, HISTORY_LAYOUT, ticks[0]!, ticks[ticks.length - 1]!, {
    width,
    font: chartFont(measure),
    unit,
  })

  return {
    ...chart,
    gridLines: ticks.map((tick) => {
      const y = yOf(tick)
      return {
        y,
        label: {
          x: chart.plot.left - GRID_LABEL_GAP,
          y: round(y + GRID_LABEL_BASELINE),
          text: formatWeightAxis(tick),
        },
      }
    }),
  }
}

/** À égale distance, la plus récente : deux pesées du même jour se lisent par la dernière. */
export function nearestPointIndex(points: readonly { x: number }[], x: number): number {
  let nearest = 0
  points.forEach((point, index) => {
    if (Math.abs(point.x - x) <= Math.abs(points[nearest]!.x - x)) nearest = index
  })
  return nearest
}
