import { formatKg, formatKgAxis, formatMonthShort } from '../utils/format'

/** Les courbes reçoivent les pesées dans l'ordre du temps. */
export type WeightChartEntry = { weightKg: number; measuredOn: string }

function round(value: number): number {
  return Math.round(value * 10) / 10
}

export const DEFAULT_CHART_WIDTH = 320

/** Taille des textes de la courbe dans son style ; la chasse ci-dessous est mesurée à cette taille. */
export const CHART_FONT_PX = 12

/**
 * `textScale` : taille de police réellement rendue sur `CHART_FONT_PX`, au-delà de 1 si le système l'agrandit.
 * `textWidth` : largeur d'un texte à `CHART_FONT_PX` quand la police n'est pas Inter (l'export PDF).
 */
export type ChartMeasure = {
  width?: number
  textScale?: number
  textWidth?: (text: string) => number
}

/** Libellés traduits par l'appelant : le calcul les mesure tels qu'ils seront écrits. */
export type CarnetChartLabels = {
  max: (weight: string) => string
  min: (weight: string) => string
  latest: (weight: string) => string
}

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
  /** Un trait par mois retenu, y compris celui dont le libellé s'efface faute de place. */
  monthTicks: number[]
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

// 10 px de plus sous la courbe du Carnet : la place où « min » s'écrit sans toucher les mois.
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
const MONTH_ROW_MARGIN = 1
const GAP_ABOVE_POINT = 8
const GAP_BELOW_POINT = 10
const GAP_BESIDE_POINT = 8
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

function interWidth(text: string): number {
  return [...text].reduce((sum, glyph) => sum + (GLYPH_WIDTHS.get(glyph) ?? DEFAULT_GLYPH_WIDTH), 0)
}

/** Chasse et hauteur des textes à la taille rendue. */
type ChartFont = { width: (text: string) => number; ascent: number; descent: number }

function chartFont({ textScale = 1, textWidth = interWidth }: ChartMeasure): ChartFont {
  return {
    width: (text) => textWidth(text) * textScale,
    ascent: TEXT_ASCENT * textScale,
    descent: TEXT_DESCENT * textScale,
  }
}

function textBox(
  x: number,
  y: number,
  anchor: ChartAnchor,
  text: string,
  font: ChartFont,
): ChartBox {
  const width = font.width(text)
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2
  return {
    left,
    right: left + width,
    top: y - font.ascent,
    bottom: y + font.descent,
  }
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

/**
 * Un mois tous les 1, 2, 3, 6 ou 12 mois, le plus petit pas qui en garde au plus six (le mois de
 * départ en plus) ; le dernier libellé finit au bout de l'axe s'il déborderait, et le mois de départ
 * ne s'écrit que s'il reste la place.
 */
function monthAxis(
  firstIsoDate: string,
  lastIsoDate: string,
  plot: ChartPlot,
  y: number,
  font: ChartFont,
  xOf: (isoDate: string) => number,
): { months: ChartMonth[]; monthTicks: number[] } {
  const label = (x: number, anchor: ChartAnchor, text: string, tickX: number | null) => ({
    x,
    y,
    text,
    anchor,
    tickX,
    box: textBox(x, y, anchor, text, font),
  })

  const starts = monthStarts(firstIsoDate, lastIsoDate)
  const step =
    MONTH_STEPS.find((candidate) => Math.ceil(starts.length / candidate) <= MAX_MONTH_LABELS) ??
    MONTH_STEPS[MONTH_STEPS.length - 1]!
  const kept = starts.filter((_, index) => index % step === 0)
  const monthTicks = kept.map(xOf)
  const months = kept.map((start, index) => {
    const tickX = monthTicks[index]!
    return label(round(tickX + MONTH_LABEL_OFFSET), 'start', formatMonthShort(start), tickX)
  })

  const last = months[months.length - 1]
  if (last && last.box.right > plot.right) {
    months[months.length - 1] = label(plot.right, 'end', last.text, last.tickX)
  }
  // Le dernier mois, collé au bout de l'axe, l'emporte sur un voisin qu'il toucherait.
  for (let index = months.length - 2; index >= 0; index -= 1) {
    if (months[index]!.box.right + LABEL_GAP > months[index + 1]!.box.left) months.splice(index, 1)
  }

  const start = label(plot.left, 'start', formatMonthShort(firstIsoDate), null)
  const firstMonth = months[0]
  if (!firstMonth || start.box.right + LABEL_GAP <= firstMonth.box.left) months.unshift(start)
  return { months, monthTicks }
}

function timeChart(
  entries: readonly WeightChartEntry[],
  layout: Layout,
  lowKg: number,
  highKg: number,
  { width, font }: { width: number; font: ChartFont },
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
  const monthY = round(layout.height - MONTH_ROW_MARGIN - font.descent)
  const axis = monthAxis(first, last, plot, monthY, font, xOf)

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
      ...axis,
    },
    yOf,
  }
}

/** Centré sur son point, sauf si le texte sortirait du tracé : il s'aligne alors sur ce bord. */
function anchorAt(x: number, width: number, plot: ChartPlot): ChartAnchor {
  if (x - width / 2 < plot.left) return 'start'
  if (x + width / 2 > plot.right) return 'end'
  return 'middle'
}

function fits(box: ChartBox, chart: TimeChart): boolean {
  return (
    box.left >= chart.plot.left &&
    box.right <= chart.plot.right &&
    box.top >= 0 &&
    box.bottom <= chart.height
  )
}

function latestPill(chart: TimeChart, text: string, font: ChartFont): CarnetWeightChart['latest'] {
  const last = chart.points[chart.points.length - 1]!
  const right = Math.min(last.x + LATEST_OVERHANG, chart.plot.right)
  const bottom = last.y - LATEST_GAP
  const width = font.width(text) + 2 * LATEST_PADDING_X
  return {
    right: round(chart.width - right),
    bottom: round(chart.height - bottom),
    text,
    box: { left: right - width, right, top: bottom - LATEST_HEIGHT, bottom },
  }
}

/** Décalage depuis le point ; sans ancre, le texte se centre sur le point tant qu'il tient. */
type Place = { dx: number; dy: number; anchor?: ChartAnchor }

/**
 * `null` quand la dernière pesée atteint déjà cet extrême : la pastille l'écrit. Sinon, la première
 * des `places` qui tient dans le graphique sans toucher un des `obstacles`.
 */
function extremeLabel(
  chart: TimeChart,
  weightKg: number,
  text: string,
  places: Place[],
  obstacles: ChartBox[],
  font: ChartFont,
): ChartLabel | null {
  const last = chart.points[chart.points.length - 1]!
  if (last.weightKg === weightKg) return null
  const point = chart.points.find((candidate) => candidate.weightKg === weightKg)!
  const width = font.width(text)
  const labels = places.map(({ dx, dy, anchor }) => {
    const x = round(point.x + dx)
    const y = round(point.y + dy)
    const side = anchor ?? anchorAt(point.x, width, chart.plot)
    return { x, y, text, anchor: side, box: textBox(x, y, side, text, font) }
  })
  const inside = labels.filter((label) => fits(label.box, chart))
  return (
    inside.find((label) => obstacles.every((obstacle) => !overlaps(label.box, obstacle))) ??
    inside[0] ??
    labels[0]!
  )
}

/** Carnet : échelle min / max ± 0,3 kg, seuls le plus haut, le plus bas et la dernière pesée écrits. */
export function buildCarnetWeightChart(
  entries: readonly WeightChartEntry[],
  labels: CarnetChartLabels,
  { width = DEFAULT_CHART_WIDTH, ...measure }: ChartMeasure = {},
): CarnetWeightChart | null {
  if (entries.length < 2) return null

  const font = chartFont(measure)
  const weights = entries.map((entry) => entry.weightKg)
  const maxKg = Math.max(...weights)
  const minKg = Math.min(...weights)
  const { chart } = timeChart(
    entries,
    CARNET_LAYOUT,
    minKg - CARNET_MARGIN_KG,
    maxKg + CARNET_MARGIN_KG,
    { width, font },
  )
  const last = chart.points[chart.points.length - 1]!
  const latest = latestPill(chart, labels.latest(formatKg(last.weightKg)), font)
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
    labels.max(formatKg(maxKg)),
    [above, below, clearOfLatest],
    obstacles,
    font,
  )
  const min = extremeLabel(
    chart,
    minKg,
    labels.min(formatKg(minKg)),
    [below, toTheRight, toTheLeft],
    max ? [...obstacles, max.box] : obstacles,
    font,
  )

  return { ...chart, max, min, latest }
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
  { width = DEFAULT_CHART_WIDTH, ...measure }: ChartMeasure = {},
): HistoryWeightChart | null {
  if (entries.length < 2) return null

  const weights = entries.map((entry) => entry.weightKg)
  const ticks = weightAxisTicks(Math.min(...weights), Math.max(...weights))
  const { chart, yOf } = timeChart(entries, HISTORY_LAYOUT, ticks[0]!, ticks[ticks.length - 1]!, {
    width,
    font: chartFont(measure),
  })

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
