import { round, type ChartPlot, type TimeChart } from './chart-time-axis'
import {
  overlaps,
  textBox,
  type ChartAnchor,
  type ChartBox,
  type ChartFont,
  type ChartLabel,
} from './chart-text-measure'

const LATEST_GAP = 10
const LATEST_OVERHANG = 6
// À tenir alignés sur le style de `.weight-sparkline__latest`.
export const LATEST_HEIGHT = 22
const LATEST_PADDING_X = 9

/** Pastille de la dernière pesée : distances de son coin bas droit aux bords droit et bas. */
export type LatestPill = { right: number; bottom: number; text: string; box: ChartBox }

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

export function latestPill(chart: TimeChart, text: string, font: ChartFont): LatestPill {
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
export type Place = { dx: number; dy: number; anchor?: ChartAnchor }

/**
 * `null` quand la dernière pesée atteint déjà cet extrême : la pastille l'écrit. Sinon, la première
 * des `places` qui tient dans le graphique sans toucher un des `obstacles`.
 */
export function extremeLabel(
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
