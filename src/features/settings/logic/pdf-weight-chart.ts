import type { jsPDF } from 'jspdf'

import i18n from '@/core/i18n'
import {
  buildCarnetWeightChart,
  CHART_FONT_PX,
  CHART_MONTH_TICK_LENGTH,
  CHART_POINT_RADIUS,
  type CarnetChartLabels,
  type ChartAnchor,
  type ChartText,
  type WeightChartEntry,
} from '@/shared/domain/weight-chart'

/** Coin haut gauche et largeur de la courbe sur la page, en mm. */
export type ChartFrame = { x: number; y: number; width: number }

type Style = 'normal' | 'bold'
type AnchoredText = ChartText & { anchor: ChartAnchor }

const ALIGN = { start: 'left', middle: 'center', end: 'right' } as const
const FONT = 'helvetica'
const FONT_PT = 9.5
const MM_PER_PT = 25.4 / 72
// Un pixel de la courbe du Carnet, sur la page : ses textes de 12 px y font FONT_PT.
const UNIT_MM = (FONT_PT * MM_PER_PT) / CHART_FONT_PX
const CAP_HEIGHT_EM = 0.718

const PETROL = '#01383E'
// Voile pétrole à 10 % déjà mêlé au blanc de la page : aucune transparence à imprimer.
const AREA = '#E6EBEC'
// Gris de la bordure de champ, plus soutenu que celui du Carnet : le gris d'écran pâlit à l'impression.
const GRID = '#B6ADA1'
const MONTH = '#736E67'
const VALUE = '#2F2722'
const ON_PETROL = '#F9F4EE'
const PAGE = '#FFFFFF'

const LINE_WIDTH = 2
const GRID_WIDTH = 1
const POINT_RING = 2

function emWidth(doc: jsPDF, text: string, style: Style): number {
  doc.setFont(FONT, style)
  return doc.getStringUnitWidth(text, { doKerning: false })
}

type Corner = readonly [number, number]

function trace(doc: jsPDF, [start, ...rest]: readonly Corner[]): jsPDF {
  doc.moveTo(start![0], start![1])
  for (const [x, y] of rest) doc.lineTo(x, y)
  return doc
}

function layoutChart(doc: jsPDF, entries: readonly WeightChartEntry[], width: number) {
  const t = i18n.global.t
  const labels: CarnetChartLabels = {
    max: (weight) => t('weight.chart.max', { weight }),
    min: (weight) => t('weight.chart.min', { weight }),
    latest: (weight) => t('weight.chart.latest', { weight }),
  }
  // Mesurés en gras, jamais plus étroit que le romain des mois : la place réservée suffit aux deux.
  return buildCarnetWeightChart(entries, labels, {
    width: Math.floor(width / UNIT_MM),
    textWidth: (text) => emWidth(doc, text, 'bold') * CHART_FONT_PX,
  })
}

/** Hauteur en mm de la courbe dans cette largeur, `null` sous deux pesées. */
export function weightChartHeight(
  doc: jsPDF,
  entries: readonly WeightChartEntry[],
  width: number,
): number | null {
  const chart = layoutChart(doc, entries, width)
  return chart ? chart.height * UNIT_MM : null
}

/** Courbe du Carnet (piste C) sur la page ; sa hauteur en mm, `null` sous deux pesées. */
export function drawWeightChart(
  doc: jsPDF,
  entries: readonly WeightChartEntry[],
  frame: ChartFrame,
): number | null {
  const chart = layoutChart(doc, entries, frame.width)
  if (!chart) return null
  const lineWidthBefore = doc.getLineWidth()
  const drawColorBefore = doc.getDrawColor()

  const mm = (value: number) => value * UNIT_MM
  const x = (value: number) => frame.x + mm(value)
  const y = (value: number) => frame.y + mm(value)
  const { plot } = chart
  const points = chart.points.map((point) => [x(point.x), y(point.y)] as const)
  const first = points[0]!
  const last = points[points.length - 1]!

  const write = ({ x: textX, y: baseline, text, anchor }: AnchoredText, style: Style) => {
    doc.setFont(FONT, style)
    doc.text(text, x(textX), y(baseline), { align: ALIGN[anchor] })
  }

  doc.setFillColor(AREA)
  trace(doc, [[first[0], y(plot.bottom)], ...points, [last[0], y(plot.bottom)]]).fill()

  doc.setDrawColor(GRID)
  doc.setLineWidth(mm(GRID_WIDTH))
  doc.line(x(plot.left), y(plot.bottom), x(plot.right), y(plot.bottom))
  for (const tickX of chart.monthTicks) {
    doc.line(x(tickX), y(plot.bottom), x(tickX), y(plot.bottom + CHART_MONTH_TICK_LENGTH))
  }

  doc.setFontSize(FONT_PT)
  doc.setTextColor(MONTH)
  for (const month of chart.months) write(month, 'normal')

  doc.setDrawColor(PETROL)
  doc.setLineWidth(mm(LINE_WIDTH))
  doc.setLineJoin('round')
  doc.setLineCap('round')
  trace(doc, points).stroke()

  doc.setFillColor(PETROL)
  doc.setDrawColor(PAGE)
  doc.setLineWidth(mm(POINT_RING))
  for (const [pointX, pointY] of points) doc.circle(pointX, pointY, mm(CHART_POINT_RADIUS), 'FD')

  doc.setTextColor(VALUE)
  for (const label of [chart.max, chart.min]) if (label) write(label, 'bold')

  const pill = chart.latest.box
  const pillHeight = mm(pill.bottom - pill.top)
  doc.setFillColor(PETROL)
  doc.roundedRect(
    x(pill.left),
    y(pill.top),
    mm(pill.right - pill.left),
    pillHeight,
    pillHeight / 2,
    pillHeight / 2,
    'F',
  )
  doc.setTextColor(ON_PETROL)
  write(
    {
      x: (pill.left + pill.right) / 2,
      y: (pill.top + pill.bottom + CAP_HEIGHT_EM * CHART_FONT_PX) / 2,
      text: chart.latest.text,
      anchor: 'middle',
    },
    'bold',
  )

  // jsPDF réécrit son trait courant en tête de chaque nouvelle page, hors de tout `restoreGraphicsState` ;
  // il n'expose ni l'extrémité ni la jointure en cours, rendues à ses valeurs par défaut.
  doc.setLineWidth(lineWidthBefore)
  doc.setDrawColor(drawColorBefore)
  doc.setLineCap('butt')
  doc.setLineJoin('miter')
  return mm(chart.height)
}
