import { formatKg, formatKgAxis, formatMonthShort } from '../utils/format'

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

/**
 * Courbe de l'export PDF : points équidistants, valeur et mois sous chaque pesée.
 * `null` sous deux pesées : une courbe à un point ne dit rien. Les pesées arrivent dans l'ordre du temps.
 */
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

export const DEFAULT_CHART_WIDTH = 320

export type ChartText = { x: number; y: number; text: string }

export type ChartAnchor = 'start' | 'middle' | 'end'

export type ChartPoint = { x: number; y: number; weightKg: number; measuredOn: string }

/** `tickX` vaut `null` pour le mois de départ, écrit au début de l'axe sans trait de repère. */
export type ChartMonth = ChartText & { tickX: number | null }

export type ChartPlot = { left: number; right: number; top: number; bottom: number }

type TimeChart = {
  width: number
  height: number
  plot: ChartPlot
  points: ChartPoint[]
  line: string
  area: string
  months: ChartMonth[]
}

export type CarnetWeightChart = TimeChart & {
  max: (ChartText & { anchor: ChartAnchor }) | null
  min: (ChartText & { anchor: ChartAnchor }) | null
  /** Pastille de la dernière pesée : distances de son coin bas droit aux bords droit et bas. */
  latest: { right: number; bottom: number; text: string }
}

export type HistoryWeightChart = TimeChart & {
  gridLines: { y: number; label: ChartText }[]
}

type Layout = { height: number; left: number; right: number; top: number; bottom: number }

const CARNET_LAYOUT: Layout = { height: 150, left: 8, right: 8, top: 34, bottom: 26 }
const HISTORY_LAYOUT: Layout = { height: 190, left: 36, right: 10, top: 12, bottom: 22 }

const CARNET_MARGIN_KG = 0.3
const TICK_STEPS_KG = [0.1, 0.2, 0.5, 1, 2, 5, 10]
const TICK_PADDING_KG = 0.1
const MAX_TICKS = 5
const MAX_MONTHS_ALL_LABELLED = 6
const START_MONTH_ROOM = 36
const MONTH_LABEL_OFFSET = 3
const BASELINE_FROM_BOTTOM = 4
const EXTREME_ABOVE = -11
const EXTREME_BELOW = 19
const EDGE_ROOM = 20
const LATEST_GAP = 10
const LATEST_OVERHANG = 6
const GRID_LABEL_GAP = 8
const GRID_LABEL_BASELINE = 4
const DAY_MS = 86_400_000

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!) / DAY_MS
}

/** Premiers jours de mois après la première pesée, jusqu'à la dernière incluse. */
function monthStarts(firstIsoDate: string, lastIsoDate: string): string[] {
  const [year, month] = firstIsoDate.split('-').map(Number)
  const lastDay = dayNumber(lastIsoDate)
  const starts: string[] = []
  for (let monthIndex = month!; ; monthIndex += 1) {
    const start = new Date(Date.UTC(year!, monthIndex, 1))
    if (start.getTime() / DAY_MS > lastDay) return starts
    starts.push(start.toISOString().slice(0, 10))
  }
}

function timeChart(
  entries: readonly WeightChartEntry[],
  width: number,
  layout: Layout,
  lowKg: number,
  highKg: number,
): { chart: TimeChart; yOf: (weightKg: number) => number } {
  const plot = {
    left: layout.left,
    right: width - layout.right,
    top: layout.top,
    bottom: layout.height - layout.bottom,
  }
  const first = entries[0]!.measuredOn
  const last = entries[entries.length - 1]!.measuredOn
  const firstDay = dayNumber(first)
  const span = dayNumber(last) - firstDay

  const xOf = (isoDate: string) =>
    round(
      span === 0
        ? (plot.left + plot.right) / 2
        : plot.left + ((dayNumber(isoDate) - firstDay) / span) * (plot.right - plot.left),
    )
  const yOf = (weightKg: number) =>
    round(plot.bottom - ((weightKg - lowKg) / (highKg - lowKg)) * (plot.bottom - plot.top))

  const points = entries.map((entry) => ({
    x: xOf(entry.measuredOn),
    y: yOf(entry.weightKg),
    weightKg: entry.weightKg,
    measuredOn: entry.measuredOn,
  }))
  const lastPoint = points[points.length - 1]!

  const starts = monthStarts(first, last)
  const labelled =
    starts.length > MAX_MONTHS_ALL_LABELLED ? starts.filter((_, index) => index % 2 === 0) : starts
  const monthY = layout.height - BASELINE_FROM_BOTTOM
  const months: ChartMonth[] = labelled.map((start) => {
    const tickX = xOf(start)
    return { x: round(tickX + MONTH_LABEL_OFFSET), y: monthY, text: formatMonthShort(start), tickX }
  })
  const firstTickX = months[0]?.tickX ?? Infinity
  if (firstTickX - plot.left > START_MONTH_ROOM) {
    months.unshift({ x: plot.left, y: monthY, text: formatMonthShort(first), tickX: null })
  }

  return {
    chart: {
      width,
      height: layout.height,
      plot,
      points,
      line: points.map((point) => `${point.x},${point.y}`).join(' '),
      area: [
        `M${points[0]!.x},${plot.bottom}`,
        ...points.map((point) => `L${point.x},${point.y}`),
        `L${lastPoint.x},${plot.bottom}`,
        'Z',
      ].join(' '),
      months,
    },
    yOf,
  }
}

function anchorAt(x: number, plot: ChartPlot): ChartAnchor {
  if (x - plot.left < EDGE_ROOM) return 'start'
  if (plot.right - x < EDGE_ROOM) return 'end'
  return 'middle'
}

/** `null` quand la dernière pesée atteint déjà cet extrême : la pastille l'écrit. */
function extremeLabel(
  chart: TimeChart,
  weightKg: number,
  offsetY: number,
): CarnetWeightChart['max'] {
  const last = chart.points[chart.points.length - 1]!
  if (last.weightKg === weightKg) return null
  const point = chart.points.find((candidate) => candidate.weightKg === weightKg)!
  return {
    x: point.x,
    y: round(point.y + offsetY),
    text: formatKg(weightKg),
    anchor: anchorAt(point.x, chart.plot),
  }
}

/** Carnet : échelle min / max ± 0,3 kg, seuls le plus haut, le plus bas et la dernière pesée écrits. */
export function buildCarnetWeightChart(
  entries: readonly WeightChartEntry[],
  width = DEFAULT_CHART_WIDTH,
): CarnetWeightChart | null {
  if (entries.length < 2) return null

  const weights = entries.map((entry) => entry.weightKg)
  const maxKg = Math.max(...weights)
  const minKg = Math.min(...weights)
  const { chart } = timeChart(
    entries,
    width,
    CARNET_LAYOUT,
    minKg - CARNET_MARGIN_KG,
    maxKg + CARNET_MARGIN_KG,
  )
  const last = chart.points[chart.points.length - 1]!

  return {
    ...chart,
    max: extremeLabel(chart, maxKg, EXTREME_ABOVE),
    min: extremeLabel(chart, minKg, EXTREME_BELOW),
    latest: {
      right: round(width - Math.min(last.x + LATEST_OVERHANG, chart.plot.right)),
      bottom: round(chart.height - (last.y - LATEST_GAP)),
      text: formatKg(last.weightKg),
    },
  }
}

/** Graduations en kg ronds encadrant les pesées : trois à cinq lignes, sauf au-delà du pas de 10 kg. */
export function weightAxisTicks(minKg: number, maxKg: number): number[] {
  const ticksFor = (step: number) => {
    // La division flottante rend 24,4 / 0,1 = 243,999… : sans tolérance, une graduation de trop.
    const low = Math.floor((minKg - TICK_PADDING_KG) / step + 1e-9)
    const high = Math.ceil((maxKg + TICK_PADDING_KG) / step - 1e-9)
    return Array.from({ length: high - low + 1 }, (_, index) => round((low + index) * step))
  }

  for (const step of TICK_STEPS_KG) {
    const ticks = ticksFor(step)
    if (ticks.length <= MAX_TICKS) return ticks
  }
  return ticksFor(TICK_STEPS_KG[TICK_STEPS_KG.length - 1]!)
}

/** Historique : lignes de repère en kg ronds, aucun chiffre sur les points. */
export function buildHistoryWeightChart(
  entries: readonly WeightChartEntry[],
  width = DEFAULT_CHART_WIDTH,
): HistoryWeightChart | null {
  if (entries.length < 2) return null

  const weights = entries.map((entry) => entry.weightKg)
  const ticks = weightAxisTicks(Math.min(...weights), Math.max(...weights))
  const { chart, yOf } = timeChart(
    entries,
    width,
    HISTORY_LAYOUT,
    ticks[0]!,
    ticks[ticks.length - 1]!,
  )

  return {
    ...chart,
    gridLines: ticks.map((weightKg) => {
      const y = yOf(weightKg)
      return {
        y,
        label: {
          x: chart.plot.left - GRID_LABEL_GAP,
          y: round(y + GRID_LABEL_BASELINE),
          text: formatKgAxis(weightKg),
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
