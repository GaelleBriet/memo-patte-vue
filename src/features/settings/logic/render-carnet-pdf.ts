import { jsPDF } from 'jspdf'

import { formatKg, formatLongDate, formatNumericDate } from '@/shared/utils/format'
import i18n from '@/core/i18n'
import { drawWeightChart } from './pdf-weight-chart'
import type { CarnetPdfContent, PdfDueState } from './pdf-content'

const PAGE_WIDTH_MM = 210
const MARGIN_MM = 18
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - 2 * MARGIN_MM
const CHART_GAP_MM = 4
const PHOTO_SIZE_MM = 24

const STATE_LABEL_KEYS: Record<PdfDueState, string> = {
  overdue: 'settings.pdf.status.overdue',
  upToDate: 'settings.pdf.status.upToDate',
  none: 'settings.pdf.status.none',
}

function speciesLabelKey(species: 'dog' | 'cat'): string {
  return `animals.form.species.${species}`
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
  doc.text(content.animal.name, MARGIN_MM, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const identityParts = [
    t(speciesLabelKey(content.animal.species)),
    content.animal.breed,
    content.animal.birthDate &&
      t('settings.pdf.identity.birthDate', { date: formatLongDate(content.animal.birthDate) }),
  ].filter((part): part is string => Boolean(part))
  doc.text(identityParts.join(' · '), MARGIN_MM, y)
  y += 10

  y = renderSection(
    doc,
    y,
    t('settings.pdf.vaccinations.title'),
    content.vaccinations.map((row) => [
      row.name,
      row.dueDate ? formatNumericDate(row.dueDate) : t('settings.pdf.status.none'),
      t(STATE_LABEL_KEYS[row.state]),
    ]),
    t('settings.pdf.vaccinations.empty'),
  )

  y = renderSection(
    doc,
    y,
    t('settings.pdf.treatments.title'),
    content.treatments.map((row) => [
      row.name,
      formatNumericDate(row.nextDueDate),
      t(STATE_LABEL_KEYS[row.state]),
    ]),
    t('settings.pdf.treatments.empty'),
  )

  y = renderWeightSection(doc, y, content, t)

  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(
    t('settings.pdf.footer', { date: formatLongDate(content.generatedOn), version: appVersion }),
    MARGIN_MM,
    287,
  )

  return new Uint8Array(doc.output('arraybuffer'))
}

function renderSection(
  doc: jsPDF,
  startY: number,
  title: string,
  rows: string[][],
  emptyLabel: string,
): number {
  let y = startY
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(title, MARGIN_MM, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  if (rows.length === 0) {
    doc.setTextColor(120)
    doc.text(emptyLabel, MARGIN_MM, y)
    doc.setTextColor(0)
    return y + 10
  }

  for (const [name, date, state] of rows) {
    doc.text(name ?? '', MARGIN_MM, y)
    doc.text(date ?? '', MARGIN_MM + CONTENT_WIDTH_MM * 0.55, y)
    doc.text(state ?? '', MARGIN_MM + CONTENT_WIDTH_MM * 0.78, y)
    y += 6.5
  }

  return y + 5
}

function renderWeightSection(
  doc: jsPDF,
  startY: number,
  content: CarnetPdfContent,
  t: (key: string, params?: Record<string, unknown>) => string,
): number {
  let y = startY
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(t('settings.pdf.weight.title'), MARGIN_MM, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  if (content.weightEntries.length === 0) {
    doc.setTextColor(120)
    doc.text(t('settings.pdf.weight.empty'), MARGIN_MM, y)
    doc.setTextColor(0)
    return y + 10
  }

  const chartTop = y + CHART_GAP_MM
  doc.saveGraphicsState()
  const chartHeight = drawWeightChart(doc, content.weightEntries, {
    x: MARGIN_MM,
    y: chartTop,
    width: CONTENT_WIDTH_MM,
  })
  doc.restoreGraphicsState()
  if (chartHeight !== null) y = chartTop + chartHeight + 7

  for (const entry of content.weightEntries) {
    doc.text(formatNumericDate(entry.measuredOn), MARGIN_MM, y)
    doc.text(`${formatKg(entry.weightKg)} ${t('weight.unit')}`, MARGIN_MM + 40, y)
    y += 6.5
  }
  y += 5

  return y
}
