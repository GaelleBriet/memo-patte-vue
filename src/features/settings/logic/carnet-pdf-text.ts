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
import type { Translate } from '@/core/i18n/translate'

export type PdfDetail = { text: string; level: 0 | 1 }

export type PdfSectionText = {
  title: string
  rows: string[][]
  emptyLabel: string
  details: PdfDetail[][]
}

export type CarnetPdfText = {
  animalName: string
  identity: string
  vaccinations: PdfSectionText
  treatments: PdfSectionText
  weight: { title: string; emptyLabel: string; rows: [date: string, weight: string][] }
}

function speciesLabelKey(species: 'dog' | 'cat'): string {
  return `animals.form.species.${species}`
}

function pdfName(name: string, t: Translate): string {
  return pdfText(name) || t('settings.pdf.noName')
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
      if (due.beforeFirstDose) return t('settings.pdf.history.stoppedBeforeFirstDose')
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
  if (due.kind !== 'due') return t('settings.pdf.history.noDose')
  const date = formatNumericDate(due.dueOn)
  return due.overdue
    ? t('settings.pdf.history.noDoseOverdue', { date })
    : t('settings.pdf.history.noDoseUpcoming', { date })
}

function repeatsLastDose(row: PdfTreatmentRow): boolean {
  const lines = row.periods.flatMap((period) => period.lines)
  const only = lines.length === 1 ? lines[0]! : null
  if (only?.kind !== 'given' || only.series.kind !== 'dates') return false
  const [dose, ...others] = only.series.doses
  return (
    others.length === 0 &&
    dose!.on === row.lastDoseDate &&
    dose!.time === null &&
    dose!.extra === row.lastDoseExtra
  )
}

function treatmentHistory(row: PdfTreatmentRow, t: Translate): PdfDetail[] {
  const summary =
    row.lastDoseDate === null
      ? noDoseLabel(row.due, t)
      : t('settings.pdf.history.lastDose', {
          date: doseText({ on: row.lastDoseDate, time: null, extra: row.lastDoseExtra }, t),
        })
  const repeats = repeatsLastDose(row)
  return [
    detail(summary),
    ...row.periods.flatMap((period) => [
      detail(periodHeadText(period, t)),
      ...(repeats ? [] : period.lines.map((line) => detail(historyLineText(line, t), 1))),
    ]),
  ]
}

function detail(text: string, level: 0 | 1 = 0): PdfDetail {
  return { text, level }
}

export function carnetPdfText(content: CarnetPdfContent, t: Translate): CarnetPdfText {
  return {
    animalName: pdfName(content.animal.name, t),
    identity: identityText(content, t),
    vaccinations: {
      title: t('settings.pdf.vaccinations.title'),
      rows: content.vaccinations.map((row) => [
        pdfName(row.name, t),
        vaccinationDueLabel(row, t),
        vaccinationStateLabel(row, content.generatedOn, t),
      ]),
      emptyLabel: t('settings.pdf.vaccinations.empty'),
      details: content.vaccinations.map((row) =>
        row.injectionDates.length === 0
          ? []
          : [
              detail(
                t('settings.pdf.history.injections', { dates: numericDates(row.injectionDates) }),
              ),
            ],
      ),
    },
    treatments: {
      title: t('settings.pdf.treatments.title'),
      rows: content.treatments.map((row) => [
        pdfName(row.name, t),
        row.state === null && row.due.kind === 'due' ? '' : treatmentDueLabel(row, t),
        row.state === null ? '' : t(`settings.pdf.status.${row.state}`),
      ]),
      emptyLabel: t('settings.pdf.treatments.empty'),
      details: content.treatments.map((row) => treatmentHistory(row, t)),
    },
    weight: {
      title: t('settings.pdf.weight.title'),
      emptyLabel: t('settings.pdf.weight.empty'),
      rows: content.weightEntries.map((entry) => [
        formatNumericDate(entry.measuredOn),
        weightText(t, entry.weightKg),
      ]),
    },
  }
}

export function pdfFooterText(generatedOn: string, appVersion: string, t: Translate): string {
  return t('settings.pdf.footer', { date: formatLongDate(generatedOn), version: appVersion })
}

export function pdfPageNumberText(page: number, total: number, t: Translate): string {
  return t('settings.pdf.pageNumber', { page, total })
}
