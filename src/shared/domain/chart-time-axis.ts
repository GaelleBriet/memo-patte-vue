import { DAY_MS } from './calendar-day'
import { displayedWeight } from './weight-display'
import type { WeightUnit } from './weight-unit'
import { formatMonthShort } from '../utils/format'
import {
  LABEL_GAP,
  textBox,
  type ChartAnchor,
  type ChartFont,
  type ChartLabel,
} from './chart-text-measure'

/** Les courbes reçoivent les pesées dans l'ordre du temps. */
export type WeightChartEntry = { weightKg: number; measuredOn: string }

export function round(value: number): number {
  return Math.round(value * 10) / 10
}

export type ChartPoint = { x: number; y: number; weightKg: number; measuredOn: string }

/** `tickX` vaut `null` pour le mois de départ, écrit au début de l'axe sans trait de repère. */
export type ChartMonth = ChartLabel & { tickX: number | null }

export type ChartPlot = { left: number; right: number; top: number; bottom: number }

export type TimeChart = {
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

export type Layout = { height: number; left: number; right: number; top: number; bottom: number }

const MONTH_STEPS = [1, 2, 3, 6, 12]
const MAX_MONTH_LABELS = 6
const MONTH_LABEL_OFFSET = 3
const MONTH_ROW_MARGIN = 1

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

export function timeChart(
  entries: readonly WeightChartEntry[],
  layout: Layout,
  low: number,
  high: number,
  { width, font, unit }: { width: number; font: ChartFont; unit: WeightUnit },
): { chart: TimeChart; yOf: (weight: number) => number } {
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
  const yOf = (weight: number) =>
    round(plot.bottom - ((weight - low) / (high - low)) * (plot.bottom - plot.top))

  const points = entries.map((entry) => ({
    x: xOf(entry.measuredOn),
    y: yOf(displayedWeight(unit, entry.weightKg)),
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
