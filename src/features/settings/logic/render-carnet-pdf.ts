import { jsPDF } from 'jspdf'

import {
  carnetPdfText,
  pdfFooterText,
  pdfPageNumberText,
  type CarnetPdfText,
  type PdfDetail,
  type PdfSectionText,
} from './carnet-pdf-text'
import { drawWeightChart, weightChartHeight } from './pdf-weight-chart'
import type { CarnetPdfContent } from './pdf-content'
import type { Translate } from '@/core/i18n/translate'

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
// Plus haut, l'historique d'une ligne ne tiendrait pas sur une page : il continue sur la suivante.
const MAX_UNSPLIT_BLOCK_MM = 200

type PageCursor = { y: number; makeRoom: (height: number) => void }

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

export type CarnetPdfPart = { content: CarnetPdfContent; photoDataUrl: string | null }

export type CarnetPdfParts = readonly [CarnetPdfPart, ...CarnetPdfPart[]]

export function renderCarnetPdf(
  parts: CarnetPdfParts,
  appVersion: string,
  t: Translate,
): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  parts.forEach((part, index) => {
    if (index > 0) doc.addPage()
    renderAnimal(doc, part, t)
  })

  writeFooters(doc, pdfFooterText(parts[0].content.generatedOn, appVersion, t), (page, total) =>
    pdfPageNumberText(page, total, t),
  )

  return new Uint8Array(doc.output('arraybuffer'))
}

function renderAnimal(doc: jsPDF, { content, photoDataUrl }: CarnetPdfPart, t: Translate): void {
  const text = carnetPdfText(content, t)
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
  const nameLines = wrap(doc, text.animalName, headerWidth)
  writeLines(doc, nameLines, MARGIN_MM, y)
  y += extraLinesHeight(doc, nameLines.length) + 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const identityLines = wrap(doc, text.identity, headerWidth)
  writeLines(doc, identityLines, MARGIN_MM, y)
  y += extraLinesHeight(doc, identityLines.length) + 10

  const cursor = createPageCursor(doc, y, () => writeContinuationHeader(doc, text.animalName))

  renderSection(doc, cursor, text.vaccinations)
  renderSection(doc, cursor, text.treatments)
  renderWeightSection(doc, cursor, content, text.weight, t)
}

type DetailBlock = { lines: { text: string; x: number }[]; height: number }

function detailBlock(doc: jsPDF, details: PdfDetail[]): DetailBlock {
  doc.setFontSize(DETAIL_PT)
  const lines = details.flatMap(({ text, level }) => {
    const indent = DETAIL_INDENT_MM * (level + 1)
    return wrap(doc, text, CONTENT_WIDTH_MM - indent).map((line) => ({
      text: line,
      x: MARGIN_MM + indent,
    }))
  })
  const height = lines.length === 0 ? 0 : DETAIL_ADVANCE_MM + extraLinesHeight(doc, lines.length)
  doc.setFontSize(ROW_PT)
  return { lines, height }
}

function withDetailStyle(doc: jsPDF, write: () => void): void {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(DETAIL_PT)
  doc.setTextColor(DETAIL_GRAY)
  write()
  doc.setTextColor(0)
  doc.setFontSize(ROW_PT)
}

function writeDetails(doc: jsPDF, { lines }: DetailBlock, lastRowLine: number): void {
  withDetailStyle(doc, () => {
    lines.forEach(({ text, x }, index) =>
      doc.text(text, x, lastRowLine + DETAIL_ADVANCE_MM + index * lineHeight(doc)),
    )
  })
}

function writeSplitDetails(doc: jsPDF, cursor: PageCursor, { lines }: DetailBlock): void {
  lines.forEach(({ text, x }, index) => {
    doc.setFontSize(DETAIL_PT)
    const step = index === 0 ? DETAIL_ADVANCE_MM : lineHeight(doc)
    const page = doc.getNumberOfPages()
    cursor.makeRoom(step + ROW_DESCENT_MM)
    if (doc.getNumberOfPages() === page) cursor.y += step
    withDetailStyle(doc, () => doc.text(text, x, cursor.y))
  })
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

function writeFooters(
  doc: jsPDF,
  generated: string,
  pageNumber: (page: number, total: number) => string,
): void {
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(generated, MARGIN_MM, FOOTER_BASELINE_MM)
    doc.text(pageNumber(page, total), PAGE_WIDTH_MM - MARGIN_MM, FOOTER_BASELINE_MM, {
      align: 'right',
    })
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
  { title, rows, emptyLabel, details }: PdfSectionText,
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
  const isSplit = (index: number) => rowHeight(index) > MAX_UNSPLIT_BLOCK_MM
  const keptHeight = (index: number) =>
    isSplit(index) ? extraHeight(wrapped[index]!) + DETAIL_ADVANCE_MM : rowHeight(index)

  writeSectionTitle(doc, cursor, title, (wrapped[0] ? keptHeight(0) : 0) + ROW_DESCENT_MM)
  if (wrapped.length === 0) {
    writeEmptyLine(doc, cursor, emptyLabel)
    return
  }

  wrapped.forEach((cells, index) => {
    const extra = extraHeight(cells)
    cursor.makeRoom(keptHeight(index) + ROW_DESCENT_MM)
    cells.forEach((lines, column) => {
      writeLines(doc, lines, MARGIN_MM + COLUMNS_MM[column]!.x, cursor.y)
    })
    if (isSplit(index)) {
      cursor.y += extra
      writeSplitDetails(doc, cursor, blocks[index]!)
      cursor.y += ROW_ADVANCE_MM
      return
    }
    writeDetails(doc, blocks[index]!, cursor.y + extra)
    cursor.y += rowHeight(index) + ROW_ADVANCE_MM
  })
  cursor.y += SECTION_GAP_MM
}

function renderWeightSection(
  doc: jsPDF,
  cursor: PageCursor,
  content: CarnetPdfContent,
  text: CarnetPdfText['weight'],
  t: Translate,
): void {
  const entries = content.weightEntries
  const chartHeight = weightChartHeight(doc, entries, CONTENT_WIDTH_MM, t)
  writeSectionTitle(doc, cursor, text.title, chartHeight ?? ROW_DESCENT_MM)
  if (entries.length === 0) {
    writeEmptyLine(doc, cursor, text.emptyLabel)
    return
  }

  if (chartHeight !== null) {
    doc.saveGraphicsState()
    drawWeightChart(doc, entries, { x: MARGIN_MM, y: cursor.y, width: CONTENT_WIDTH_MM }, t)
    doc.restoreGraphicsState()
    cursor.y += chartHeight + CHART_GAP_MM
  }

  for (const [date, weight] of text.rows) {
    cursor.makeRoom(ROW_DESCENT_MM)
    doc.text(date, MARGIN_MM, cursor.y)
    doc.text(weight, MARGIN_MM + 40, cursor.y)
    cursor.y += ROW_ADVANCE_MM
  }
  cursor.y += SECTION_GAP_MM
}
