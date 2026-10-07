import { jsPDF } from 'jspdf'

import { animalAge, animalAgeText } from '@/shared/domain/animal-age'
import { dosageText } from '@/shared/domain/dosage'
import { weightText } from '@/shared/domain/weight-display'
import {
  formatClockTime,
  formatClockTimes,
  formatDayMonthOrYear,
  formatLongDate,
  formatNumericDate,
} from '@/shared/utils/format'
import i18n from '@/core/i18n'
import { drawWeightChart, weightChartHeight } from './pdf-weight-chart'
import { pdfText } from './pdf-text'
import type {
  CarnetPdfContent,
  PdfDose,
  PdfDoseSeries,
  PdfHistoryLine,
  PdfTreatmentPeriod,
  PdfTreatmentRow,
  PdfVaccinationRow,
} from './pdf-content'

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

type Translate = (key: string, params?: Record<string, unknown>, plural?: number) => string

type PageCursor = { y: number; makeRoom: (height: number) => void }

function speciesLabelKey(species: 'dog' | 'cat'): string {
  return `animals.form.species.${species}`
}

function pdfName(name: string, t: Translate): string {
  return pdfText(name) || t('settings.pdf.noName')
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

export type CarnetPdfPart = { content: CarnetPdfContent; photoDataUrl: string | null }

export type CarnetPdfParts = readonly [CarnetPdfPart, ...CarnetPdfPart[]]

export function renderCarnetPdf(parts: CarnetPdfParts, appVersion: string): Uint8Array {
  const t = i18n.global.t
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  parts.forEach((part, index) => {
    if (index > 0) doc.addPage()
    renderAnimal(doc, part, t)
  })

  writeFooters(
    doc,
    t('settings.pdf.footer', {
      date: formatLongDate(parts[0].content.generatedOn),
      version: appVersion,
    }),
    t,
  )

  return new Uint8Array(doc.output('arraybuffer'))
}

function renderAnimal(doc: jsPDF, { content, photoDataUrl }: CarnetPdfPart, t: Translate): void {
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
  const animalName = pdfName(content.animal.name, t)
  const nameLines = wrap(doc, animalName, headerWidth)
  writeLines(doc, nameLines, MARGIN_MM, y)
  y += extraLinesHeight(doc, nameLines.length) + 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const identityLines = wrap(doc, identityText(content, t), headerWidth)
  writeLines(doc, identityLines, MARGIN_MM, y)
  y += extraLinesHeight(doc, identityLines.length) + 10

  const cursor = createPageCursor(doc, y, () => writeContinuationHeader(doc, animalName))

  renderSection(
    doc,
    cursor,
    t('settings.pdf.vaccinations.title'),
    content.vaccinations.map((row) => [
      pdfName(row.name, t),
      vaccinationDueLabel(row, t),
      vaccinationStateLabel(row, content.generatedOn, t),
    ]),
    t('settings.pdf.vaccinations.empty'),
    content.vaccinations.map((row) =>
      row.injectionDates.length === 0
        ? []
        : [
            detail(
              t('settings.pdf.history.injections', { dates: numericDates(row.injectionDates) }),
            ),
          ],
    ),
  )

  renderSection(
    doc,
    cursor,
    t('settings.pdf.treatments.title'),
    content.treatments.map((row) => [
      pdfName(row.name, t),
      row.state === null && row.due.kind === 'due' ? '' : treatmentDueLabel(row, t),
      row.state === null ? '' : t(`settings.pdf.status.${row.state}`),
    ]),
    t('settings.pdf.treatments.empty'),
    content.treatments.map((row) => treatmentHistory(row, t)),
  )

  renderWeightSection(doc, cursor, content, t)
}

function ageText(
  { birthDate, birthDateApproximate }: CarnetPdfContent['animal'],
  today: string,
  t: Translate,
): string | null {
  const text = animalAgeText(
    (key, named, plural) => t(key, named, plural),
    { birthDate, approximate: false },
    today,
  )
  if (text === null || !birthDateApproximate || animalAge(birthDate, today)?.value === 0)
    return text
  return t('settings.pdf.identity.estimatedAge', { age: text })
}

function identityText({ animal, generatedOn }: CarnetPdfContent, t: Translate): string {
  const date = animal.birthDate && formatLongDate(animal.birthDate)
  const birthDate =
    date &&
    (animal.birthDateApproximate
      ? t('settings.pdf.identity.birthDateApproximate', { date })
      : t('settings.pdf.identity.birthDate', { date }))
  const age = animal.departureDate === null ? ageText(animal, generatedOn, t) : null
  const until =
    animal.departureDate &&
    t('settings.pdf.identity.until', { date: formatLongDate(animal.departureDate) })
  return [
    t(speciesLabelKey(animal.species)),
    animal.breed && pdfText(animal.breed),
    birthDate,
    age,
    until,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

function vaccinationDueLabel(row: PdfVaccinationRow, t: Translate): string {
  if (row.state === null) return ''
  return row.dueDate ? formatNumericDate(row.dueDate) : t('settings.pdf.status.none')
}

function vaccinationStateLabel(row: PdfVaccinationRow, today: string, t: Translate): string {
  if (row.state === null) return ''
  if (row.state !== 'planned' || row.dueDate === null) return t(`settings.pdf.status.${row.state}`)
  return t('settings.pdf.status.planned', { date: formatDayMonthOrYear(row.dueDate, today) })
}

function treatmentDueLabel({ due }: PdfTreatmentRow, t: Translate): string {
  switch (due.kind) {
    case 'due':
      return due.dueTime === null
        ? formatNumericDate(due.dueOn)
        : t('settings.pdf.treatments.dueAt', {
            date: formatNumericDate(due.dueOn),
            time: formatClockTime(due.dueTime),
          })
    case 'stopped':
      return due.on === null
        ? t('settings.pdf.treatments.noDate')
        : t('settings.pdf.treatments.stopped', { date: formatNumericDate(due.on) })
    case 'ended':
      return due.on === null
        ? t('settings.pdf.treatments.noDate')
        : t('settings.pdf.treatments.ended', { date: formatNumericDate(due.on) })
    case 'unreadable':
      return t('settings.pdf.treatments.unreadable')
  }
}

function numericDates(dates: string[]): string {
  return dates.map(formatNumericDate).join(' · ')
}

function doseText({ on, time, extra }: PdfDose, t: Translate): string {
  const day = formatNumericDate(on)
  const date =
    time === null
      ? day
      : t('settings.pdf.treatments.dueAt', { date: day, time: formatClockTime(time) })
  return extra ? t('settings.pdf.history.extraDose', { date }) : date
}

function doseList(doses: PdfDose[], t: Translate): string {
  return doses.map((dose) => doseText(dose, t)).join(' · ')
}

function rangeDates(series: Extract<PdfDoseSeries, { kind: 'range' }>) {
  return {
    count: series.count,
    from: formatNumericDate(series.from),
    to: formatNumericDate(series.to),
  }
}

function atTime(text: string, time: string | null): string {
  return time === null ? text : `${text} · ${formatClockTime(time)}`
}

function givenText(series: PdfDoseSeries, t: Translate): string {
  return series.kind === 'dates'
    ? t('settings.pdf.history.doses', { dates: doseList(series.doses, t) }, series.doses.length)
    : atTime(t('settings.pdf.history.doseRange', rangeDates(series)), series.time)
}

function missedText(series: PdfDoseSeries, t: Translate): string {
  return series.kind === 'dates'
    ? t('settings.pdf.history.missed', { dates: doseList(series.doses, t) }, series.doses.length)
    : atTime(t('settings.pdf.history.missedRange', rangeDates(series)), series.time)
}

function historyLineText(line: PdfHistoryLine, t: Translate): string {
  switch (line.kind) {
    case 'given':
      return givenText(line.series, t)
    case 'missed':
      return missedText(line.series, t)
    case 'unlogged':
      return atTime(
        line.from === line.to
          ? t('settings.pdf.history.unloggedDay', { date: formatNumericDate(line.from) })
          : t('settings.pdf.history.unlogged', {
              from: formatNumericDate(line.from),
              to: formatNumericDate(line.to),
            }),
        line.time,
      )
    case 'moved': {
      const dates = { date: formatNumericDate(line.to), due: formatNumericDate(line.dueOn) }
      return line.advanced
        ? t('treatments.history.advanced', dates)
        : t('treatments.history.postponed', dates)
    }
  }
}

function periodRangeText({ from, to }: PdfTreatmentPeriod, t: Translate): string {
  if (to === null) return t('treatments.history.period.since', { date: formatNumericDate(from) })
  if (to <= from) return t('treatments.history.period.single', { date: formatNumericDate(from) })
  return t('treatments.history.period.range', {
    from: formatNumericDate(from),
    to: formatNumericDate(to),
  })
}

function periodHeadText(period: PdfTreatmentPeriod, t: Translate): string {
  const { value, unit } = period.frequency
  return [
    periodRangeText(period, t),
    t(`treatments.frequency.${unit}`, { n: value }, value),
    period.times.length > 0 && formatClockTimes(period.times),
    dosageText((key, named, plural) => t(key, named, plural), period.dosage),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

function noDoseLabel(due: PdfTreatmentRow['due'], t: Translate): string {
  if (due.kind === 'stopped') return t('settings.pdf.history.stoppedBeforeFirstDose')
  if (due.kind !== 'due') return t('settings.pdf.history.noDose')
  const date = formatNumericDate(due.dueOn)
  return due.overdue
    ? t('settings.pdf.history.noDoseOverdue', { date })
    : t('settings.pdf.history.noDoseUpcoming', { date })
}

function treatmentHistory(row: PdfTreatmentRow, t: Translate): Detail[] {
  const summary =
    row.lastDoseDate === null
      ? noDoseLabel(row.due, t)
      : t('settings.pdf.history.lastDose', {
          date: doseText({ on: row.lastDoseDate, time: null, extra: row.lastDoseExtra }, t),
        })
  return [
    detail(summary),
    ...row.periods.flatMap((period) => [
      detail(periodHeadText(period, t)),
      ...period.lines.map((line) => detail(historyLineText(line, t), 1)),
    ]),
  ]
}

type Detail = { text: string; level: 0 | 1 }

function detail(text: string, level: 0 | 1 = 0): Detail {
  return { text, level }
}

type DetailBlock = { lines: { text: string; x: number }[]; height: number }

function detailBlock(doc: jsPDF, details: Detail[]): DetailBlock {
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
  details: Detail[][],
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
