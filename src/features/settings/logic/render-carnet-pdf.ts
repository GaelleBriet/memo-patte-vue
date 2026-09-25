import { jsPDF } from 'jspdf'

import { weightText } from '@/shared/domain/weight-display'
import { formatLongDate, formatNumericDate } from '@/shared/utils/format'
import i18n from '@/core/i18n'
import { drawWeightChart, weightChartHeight } from './pdf-weight-chart'
import type { CarnetPdfContent, PdfDoseSeries, PdfDueState, PdfTreatmentRow } from './pdf-content'

const PAGE_WIDTH_MM = 210
const PAGE_HEIGHT_MM = 297
const MARGIN_MM = 18
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - 2 * MARGIN_MM
const BODY_BOTTOM_MM = PAGE_HEIGHT_MM - MARGIN_MM
const FOOTER_BASELINE_MM = 286
const PHOTO_SIZE_MM = 24
const PHOTO_GAP_MM = 6

const TITLE_ADVANCE_MM = 7
const ROW_PT = 10.5
const ROW_ADVANCE_MM = 6.5
// Jambage d'Helvetica (0,22 em) : le bas d'une ligne écrite sur sa ligne de base.
const ROW_DESCENT_MM = (0.22 * ROW_PT * 25.4) / 72
const SECTION_GAP_MM = 5
const EMPTY_ADVANCE_MM = 10
const CHART_GAP_MM = 7
const CONTINUATION_ADVANCE_MM = 10
const COLUMN_GAP_MM = 4
const COLUMNS_MM = [
  { x: 0, width: CONTENT_WIDTH_MM * 0.55 - COLUMN_GAP_MM },
  { x: CONTENT_WIDTH_MM * 0.55, width: CONTENT_WIDTH_MM * 0.23 - COLUMN_GAP_MM },
  { x: CONTENT_WIDTH_MM * 0.78, width: CONTENT_WIDTH_MM * 0.22 },
]
const DETAIL_PT = 9
const DETAIL_ADVANCE_MM = 4.6
const DETAIL_INDENT_MM = 4
const DETAIL_GRAY = 90

const STATE_LABEL_KEYS: Record<PdfDueState, string> = {
  overdue: 'settings.pdf.status.overdue',
  upToDate: 'settings.pdf.status.upToDate',
  none: 'settings.pdf.status.none',
}

type Translate = (key: string, params?: Record<string, unknown>) => string

type PageCursor = { y: number; makeRoom: (height: number) => void }

function speciesLabelKey(species: 'dog' | 'cat'): string {
  return `animals.form.species.${species}`
}

function lineHeight(doc: jsPDF): number {
  return (doc.getFontSize() * doc.getLineHeightFactor()) / doc.internal.scaleFactor
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width)
}

function writeLines(doc: jsPDF, lines: readonly string[], x: number, y: number): void {
  lines.forEach((line, index) => doc.text(line, x, y + index * lineHeight(doc)))
}

function extraLinesHeight(doc: jsPDF, lineCount: number): number {
  return (lineCount - 1) * lineHeight(doc)
}

function createPageCursor(doc: jsPDF, y: number, continuePage: () => number): PageCursor {
  const cursor: PageCursor = {
    y,
    makeRoom(height) {
      if (cursor.y + height <= BODY_BOTTOM_MM) return
      doc.addPage()
      cursor.y = continuePage()
    },
  }
  return cursor
}

export function renderCarnetPdf(
  content: CarnetPdfContent,
  appVersion: string,
  photoDataUrl: string | null,
): Uint8Array {
  const t = i18n.global.t
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN_MM

  if (photoDataUrl) {
    try {
      doc.addImage(
        photoDataUrl,
        'JPEG',
        PAGE_WIDTH_MM - MARGIN_MM - PHOTO_SIZE_MM,
        MARGIN_MM,
        PHOTO_SIZE_MM,
        PHOTO_SIZE_MM,
      )
    } catch {
      /* Photo corrompue ou illisible : le PDF reste généré sans elle. */
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('MémoPatte', MARGIN_MM, y)
  y += 10

  doc.setFontSize(15)
  const headerWidth = photoDataUrl
    ? CONTENT_WIDTH_MM - PHOTO_SIZE_MM - PHOTO_GAP_MM
    : CONTENT_WIDTH_MM
  const nameLines = wrap(doc, content.animal.name, headerWidth)
  writeLines(doc, nameLines, MARGIN_MM, y)
  y += extraLinesHeight(doc, nameLines.length) + 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const identityParts = [
    t(speciesLabelKey(content.animal.species)),
    content.animal.breed,
    content.animal.birthDate &&
      t('settings.pdf.identity.birthDate', { date: formatLongDate(content.animal.birthDate) }),
  ].filter((part): part is string => Boolean(part))
  const identityLines = wrap(doc, identityParts.join(' · '), headerWidth)
  writeLines(doc, identityLines, MARGIN_MM, y)
  y += extraLinesHeight(doc, identityLines.length) + 10

  const cursor = createPageCursor(doc, y, () => writeContinuationHeader(doc, content.animal.name))

  renderSection(
    doc,
    cursor,
    t('settings.pdf.vaccinations.title'),
    content.vaccinations.map((row) => [
      row.name,
      row.dueDate ? formatNumericDate(row.dueDate) : t('settings.pdf.status.none'),
      t(STATE_LABEL_KEYS[row.state]),
    ]),
    t('settings.pdf.vaccinations.empty'),
    content.vaccinations.map((row) => [
      t('settings.pdf.history.injections', { dates: numericDates(row.injectionDates) }),
    ]),
  )

  renderSection(
    doc,
    cursor,
    t('settings.pdf.treatments.title'),
    content.treatments.map((row) => [
      row.name,
      treatmentDueLabel(row, t),
      t(STATE_LABEL_KEYS[row.state]),
    ]),
    t('settings.pdf.treatments.empty'),
    content.treatments.map((row) => doseHistory(row, t)),
  )

  renderWeightSection(doc, cursor, content, t)

  writeFooters(
    doc,
    t('settings.pdf.footer', { date: formatLongDate(content.generatedOn), version: appVersion }),
    t,
  )

  return new Uint8Array(doc.output('arraybuffer'))
}

function treatmentDueLabel(row: PdfTreatmentRow, t: Translate): string {
  if (row.stoppedOn) {
    return t('settings.pdf.treatments.stopped', { date: formatNumericDate(row.stoppedOn) })
  }
  return row.nextDueDate ? formatNumericDate(row.nextDueDate) : t('settings.pdf.status.none')
}

function numericDates(dates: string[]): string {
  return dates.map(formatNumericDate).join(' · ')
}

function doseSeriesLabel(series: PdfDoseSeries, t: Translate): string {
  if (series.kind === 'dates') return numericDates(series.dates)
  return t('settings.pdf.history.doseRange', {
    count: series.count,
    from: formatNumericDate(series.from),
    to: formatNumericDate(series.to),
  })
}

function doseHistory(row: PdfTreatmentRow, t: Translate): string[] {
  const last = t('settings.pdf.history.lastDose', { date: formatNumericDate(row.lastDoseDate) })
  if (row.previousDoses.length === 0) return [last]
  const series = row.previousDoses.map((item) => doseSeriesLabel(item, t)).join(' · ')
  return [last, t('settings.pdf.history.previousDoses', { series })]
}

type DetailBlock = { lines: string[]; height: number }

function detailBlock(doc: jsPDF, details: string[]): DetailBlock {
  doc.setFontSize(DETAIL_PT)
  const lines = details.flatMap((detail) => wrap(doc, detail, CONTENT_WIDTH_MM - DETAIL_INDENT_MM))
  const height = lines.length === 0 ? 0 : DETAIL_ADVANCE_MM + extraLinesHeight(doc, lines.length)
  doc.setFontSize(ROW_PT)
  return { lines, height }
}

function writeDetails(doc: jsPDF, { lines }: DetailBlock, lastRowLine: number): void {
  doc.setFontSize(DETAIL_PT)
  doc.setTextColor(DETAIL_GRAY)
  writeLines(doc, lines, MARGIN_MM + DETAIL_INDENT_MM, lastRowLine + DETAIL_ADVANCE_MM)
  doc.setTextColor(0)
  doc.setFontSize(ROW_PT)
}

function writeContinuationHeader(doc: jsPDF, animalName: string): number {
  doc.saveGraphicsState()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0)
  const lines = wrap(doc, animalName, CONTENT_WIDTH_MM)
  writeLines(doc, lines, MARGIN_MM, MARGIN_MM)
  const height = extraLinesHeight(doc, lines.length)
  doc.restoreGraphicsState()
  return MARGIN_MM + height + CONTINUATION_ADVANCE_MM
}

function writeFooters(doc: jsPDF, generated: string, t: Translate): void {
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(generated, MARGIN_MM, FOOTER_BASELINE_MM)
    doc.text(
      t('settings.pdf.pageNumber', { page, total }),
      PAGE_WIDTH_MM - MARGIN_MM,
      FOOTER_BASELINE_MM,
      { align: 'right' },
    )
  }
}

function writeSectionTitle(doc: jsPDF, cursor: PageCursor, title: string, firstBlock: number) {
  cursor.makeRoom(TITLE_ADVANCE_MM + firstBlock)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(title, MARGIN_MM, cursor.y)
  cursor.y += TITLE_ADVANCE_MM
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(ROW_PT)
}

function writeEmptyLine(doc: jsPDF, cursor: PageCursor, label: string): void {
  doc.setTextColor(120)
  doc.text(label, MARGIN_MM, cursor.y)
  doc.setTextColor(0)
  cursor.y += EMPTY_ADVANCE_MM
}

function renderSection(
  doc: jsPDF,
  cursor: PageCursor,
  title: string,
  rows: string[][],
  emptyLabel: string,
  details: string[][],
): void {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(ROW_PT)
  const wrapped = rows.map((cells) =>
    cells.map((cell, column) => wrap(doc, cell, COLUMNS_MM[column]!.width)),
  )
  const extraHeight = (cells: string[][]) =>
    extraLinesHeight(doc, Math.max(...cells.map((lines) => lines.length)))
  const blocks = rows.map((_, index) => detailBlock(doc, details[index] ?? []))
  const rowHeight = (index: number) => extraHeight(wrapped[index]!) + blocks[index]!.height

  writeSectionTitle(doc, cursor, title, (wrapped[0] ? rowHeight(0) : 0) + ROW_DESCENT_MM)
  if (wrapped.length === 0) {
    writeEmptyLine(doc, cursor, emptyLabel)
    return
  }

  wrapped.forEach((cells, index) => {
    const extra = extraHeight(cells)
    const height = rowHeight(index)
    cursor.makeRoom(height + ROW_DESCENT_MM)
    cells.forEach((lines, column) => {
      writeLines(doc, lines, MARGIN_MM + COLUMNS_MM[column]!.x, cursor.y)
    })
    writeDetails(doc, blocks[index]!, cursor.y + extra)
    cursor.y += height + ROW_ADVANCE_MM
  })
  cursor.y += SECTION_GAP_MM
}

function renderWeightSection(
  doc: jsPDF,
  cursor: PageCursor,
  content: CarnetPdfContent,
  t: Translate,
): void {
  const entries = content.weightEntries
  const chartHeight = weightChartHeight(doc, entries, CONTENT_WIDTH_MM)
  writeSectionTitle(doc, cursor, t('settings.pdf.weight.title'), chartHeight ?? ROW_DESCENT_MM)
  if (entries.length === 0) {
    writeEmptyLine(doc, cursor, t('settings.pdf.weight.empty'))
    return
  }

  if (chartHeight !== null) {
    doc.saveGraphicsState()
    drawWeightChart(doc, entries, { x: MARGIN_MM, y: cursor.y, width: CONTENT_WIDTH_MM })
    doc.restoreGraphicsState()
    cursor.y += chartHeight + CHART_GAP_MM
  }

  for (const entry of entries) {
    cursor.makeRoom(ROW_DESCENT_MM)
    doc.text(formatNumericDate(entry.measuredOn), MARGIN_MM, cursor.y)
    doc.text(weightText(t, entry.weightKg), MARGIN_MM + 40, cursor.y)
    cursor.y += ROW_ADVANCE_MM
  }
  cursor.y += SECTION_GAP_MM
}
