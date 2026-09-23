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

/** Place estimée d'un texte écrit, pour qu'aucun ne chevauche son voisin. */
export type ChartBox = { left: number; right: number; top: number; bottom: number }

export type ChartLabel = ChartText & { anchor: ChartAnchor; box: ChartBox }

export type ChartPoint = { x: number; y: number; weightKg: number; measuredOn: string }

/** `tickX` vaut `null` pour le mois de départ, écrit au début de l'axe sans trait de repère. */
export type ChartMonth = ChartLabel & { tickX: number | null }

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
  max: ChartLabel | null
  min: ChartLabel | null
  /** Pastille de la dernière pesée : distances de son coin bas droit aux bords droit et bas. */
  latest: { right: number; bottom: number; text: string; box: ChartBox }
}

export type HistoryWeightChart = TimeChart & {
  gridLines: { y: number; label: ChartText }[]
}

type Layout = { height: number; left: number; right: number; top: number; bottom: number }

// La rangée des mois du Carnet descend de 10 px : « min » tient toujours au-dessus.
const CARNET_LAYOUT: Layout = { height: 160, left: 8, right: 8, top: 34, bottom: 36 }
const HISTORY_LAYOUT: Layout = { height: 190, left: 36, right: 10, top: 12, bottom: 22 }

const CARNET_MARGIN_KG = 0.3
const TICK_STEPS_KG = [0.1, 0.2, 0.5, 1, 2, 5, 10]
const TICK_PADDING_KG = 0.1
const MAX_TICKS = 5
const MONTH_STEPS = [1, 2, 3, 6, 12]
const MAX_MONTH_LABELS = 6
const MONTH_LABEL_OFFSET = 3
const LABEL_GAP = 1
const BASELINE_FROM_BOTTOM = 4
const MAX_ABOVE = -11
// Plus bas que « min » : sous son point, « max » échappe à la pastille quelle que soit leur distance.
const MAX_BELOW = 23
const MIN_BELOW = 19
const EDGE_ROOM = 20
const LATEST_GAP = 10
const LATEST_OVERHANG = 6
// À tenir alignés sur le style de `.weight-sparkline__latest`.
const LATEST_HEIGHT = 22
const LATEST_PADDING_X = 9
const GRID_LABEL_GAP = 8
const GRID_LABEL_BASELINE = 4
const DAY_MS = 86_400_000

// Chasse d'Inter à 12 px, mesurée et arrondie au dixième supérieur ; un glyphe absent compte 8 px.
const GLYPH_WIDTHS = new Map(
  (
    [
      [' \u00a0il', 3.2],
      ['.,', 3.9],
      ['t', 4.3],
      ['r', 4.8],
      ['1', 5.1],
      ['s', 6.6],
      ['akx', 6.9],
      ['7Jc', 7],
      ['vFéey', 7.1],
      ['5nuoû', 7.4],
      ['2pb', 7.5],
      ['g', 7.6],
      ['3689', 7.7],
      ['S', 7.8],
      ['04', 8],
      ['D', 8.7],
      ['A', 8.8],
      ['N', 9.2],
      ['O', 9.3],
      ['m', 10.8],
      ['M', 11.1],
    ] as const
  ).flatMap(([glyphs, width]) => [...glyphs].map((glyph) => [glyph, width] as const)),
)
const DEFAULT_GLYPH_WIDTH = 8
const TEXT_ASCENT = 9
const TEXT_DESCENT = 3

function textWidth(text: string): number {
  return [...text].reduce((sum, glyph) => sum + (GLYPH_WIDTHS.get(glyph) ?? DEFAULT_GLYPH_WIDTH), 0)
}

function textBox(x: number, y: number, anchor: ChartAnchor, text: string): ChartBox {
  const width = textWidth(text)
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2
  return { left, right: left + width, top: y - TEXT_ASCENT, bottom: y + TEXT_DESCENT }
}

function overlaps(a: ChartBox, b: ChartBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

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

function monthLabel(
  x: number,
  y: number,
  anchor: ChartAnchor,
  text: string,
  tickX: number | null,
): ChartMonth {
  return { x, y, text, anchor, tickX, box: textBox(x, y, anchor, text) }
}

/**
 * Un libellé tous les 1, 2, 3, 6 ou 12 mois, le plus petit pas qui en garde au plus six ; le dernier
 * finit au bout de l'axe s'il déborderait, et le mois de départ ne s'écrit que s'il reste la place.
 */
function monthLabels(
  firstIsoDate: string,
  lastIsoDate: string,
  plot: ChartPlot,
  y: number,
  xOf: (isoDate: string) => number,
): ChartMonth[] {
  const starts = monthStarts(firstIsoDate, lastIsoDate)
  const step =
    MONTH_STEPS.find((candidate) => Math.ceil(starts.length / candidate) <= MAX_MONTH_LABELS) ??
    MONTH_STEPS[MONTH_STEPS.length - 1]!
  const months = starts
    .filter((_, index) => index % step === 0)
    .map((start) => {
      const tickX = xOf(start)
      return monthLabel(
        round(tickX + MONTH_LABEL_OFFSET),
        y,
        'start',
        formatMonthShort(start),
        tickX,
      )
    })

  const last = months[months.length - 1]
  if (last && last.box.right > plot.right) {
    months[months.length - 1] = monthLabel(plot.right, y, 'end', last.text, last.tickX)
  }
  // Le dernier mois, collé au bout de l'axe, l'emporte sur un voisin qu'il toucherait.
  for (let index = months.length - 2; index >= 0; index -= 1) {
    if (months[index]!.box.right + LABEL_GAP > months[index + 1]!.box.left) months.splice(index, 1)
  }

  const start = monthLabel(plot.left, y, 'start', formatMonthShort(firstIsoDate), null)
  const firstMonth = months[0]
  if (!firstMonth || start.box.right + LABEL_GAP <= firstMonth.box.left) months.unshift(start)
  return months
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
  const months = monthLabels(first, last, plot, layout.height - BASELINE_FROM_BOTTOM, xOf)

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

function latestPill(chart: TimeChart): CarnetWeightChart['latest'] {
  const last = chart.points[chart.points.length - 1]!
  const right = Math.min(last.x + LATEST_OVERHANG, chart.plot.right)
  const bottom = last.y - LATEST_GAP
  const text = formatKg(last.weightKg)
  const width = textWidth(`${text}\u00a0kg`) + 2 * LATEST_PADDING_X
  return {
    right: round(chart.width - right),
    bottom: round(chart.height - bottom),
    text,
    box: { left: right - width, right, top: bottom - LATEST_HEIGHT, bottom },
  }
}

/**
 * `null` quand la dernière pesée atteint déjà cet extrême : la pastille l'écrit. Sinon, la première
 * des places `offsetsY` (décalages sous le point) qui ne chevauche pas la pastille.
 */
function extremeLabel(
  chart: TimeChart,
  weightKg: number,
  wording: 'max' | 'min',
  offsetsY: readonly number[],
  latest: ChartBox,
): ChartLabel | null {
  const last = chart.points[chart.points.length - 1]!
  if (last.weightKg === weightKg) return null
  const point = chart.points.find((candidate) => candidate.weightKg === weightKg)!
  const text = formatKg(weightKg)
  const anchor = anchorAt(point.x, chart.plot)
  const places = offsetsY.map((offsetY) => {
    const y = round(point.y + offsetY)
    return { x: point.x, y, text, anchor, box: textBox(point.x, y, anchor, `${wording} ${text}`) }
  })
  return places.find((place) => !overlaps(place.box, latest)) ?? places[places.length - 1]!
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
  const latest = latestPill(chart)

  return {
    ...chart,
    max: extremeLabel(chart, maxKg, 'max', [MAX_ABOVE, MAX_BELOW], latest.box),
    min: extremeLabel(chart, minKg, 'min', [MIN_BELOW], latest.box),
    latest,
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
