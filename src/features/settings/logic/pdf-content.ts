import { differenceInCalendarDays, format, parseISO } from 'date-fns'

import { EXPORT_FILE_TIME } from './export-format'
import { buildReminders, type ReminderKind } from '@/shared/domain/reminders'
import type { ExportData, ExportTreatmentDose } from '@/shared/domain/carnet-data'
import { treatmentHistories, vaccinationHistories } from '@/shared/domain/carnet-heads'

export type PdfDueState = 'overdue' | 'upToDate' | 'none'

export type PdfVaccinationRow = {
  name: string
  lastInjectionDate: string
  /** Toutes les injections, la plus récente d'abord : un vaccin n'est jamais regroupé. */
  injectionDates: string[]
  dueDate: string | null
  state: PdfDueState
}

/** Prises régulières d'un traitement : listées jusqu'à trois, résumées au-delà. */
export type PdfDoseSeries =
  { kind: 'dates'; dates: string[] } | { kind: 'range'; count: number; from: string; to: string }

export type PdfTreatmentRow = {
  name: string
  lastDoseDate: string
  /** Les prises avant la dernière, par séries, la plus récente d'abord. */
  previousDoses: PdfDoseSeries[]
  /** `null` pour un traitement arrêté : il n'a plus d'échéance. */
  nextDueDate: string | null
  stoppedOn: string | null
  state: PdfDueState
}

export type PdfWeightRow = {
  measuredOn: string
  weightKg: number
}

export type CarnetPdfContent = {
  animal: {
    name: string
    species: 'dog' | 'cat'
    breed: string | null
    birthDate: string | null
    photoFileName: string | null
  }
  generatedOn: string
  vaccinations: PdfVaccinationRow[]
  treatments: PdfTreatmentRow[]
  weightEntries: PdfWeightRow[]
}

function dueState(dueDate: string | null, today: string, kind: ReminderKind): PdfDueState {
  if (dueDate === null) return 'none'
  const { overdue } = buildReminders([{ kind, id: '', animalId: '', label: '', dueDate }], {
    today,
  })
  return overdue > 0 ? 'overdue' : 'upToDate'
}

const MAX_LISTED_DOSES = 3
const SERIES_GAP_FACTOR = 1.5
const DAYS_PER_UNIT = { day: 1, week: 7, month: 365.25 / 12 }

// Fréquence de la prise précédente : celle avec laquelle la suivante était attendue.
function isSameSeries(previous: ExportTreatmentDose, next: ExportTreatmentDose): boolean {
  const gap = differenceInCalendarDays(parseISO(next.givenOn), parseISO(previous.givenOn))
  const period = previous.frequency.value * DAYS_PER_UNIT[previous.frequency.unit]
  return gap <= SERIES_GAP_FACTOR * period
}

function doseSeries(doses: readonly ExportTreatmentDose[]): PdfDoseSeries[] {
  const series: ExportTreatmentDose[][] = []
  for (const dose of [...doses].reverse()) {
    const current = series.at(-1)
    const previous = current?.at(-1)
    if (current && previous && isSameSeries(previous, dose)) current.push(dose)
    else series.push([dose])
  }
  return series.reverse().map((group): PdfDoseSeries => {
    const dates = group.map(({ givenOn }) => givenOn)
    return dates.length <= MAX_LISTED_DOSES
      ? { kind: 'dates', dates: dates.reverse() }
      : { kind: 'range', count: dates.length, from: dates[0]!, to: dates.at(-1)! }
  })
}

function byDueDateAscending(a: { dueDate: string | null }, b: { dueDate: string | null }): number {
  if (a.dueDate === null || b.dueDate === null) {
    return Number(a.dueDate === null) - Number(b.dueDate === null)
  }
  return a.dueDate.localeCompare(b.dueDate)
}

export function buildCarnetPdfContent(
  data: ExportData,
  animalId: string,
  today: string,
): CarnetPdfContent | null {
  const animal = data.animals.find((item) => item.id === animalId)
  if (!animal) return null

  const injections = vaccinationHistories(data.vaccinationInjections)
  const doses = treatmentHistories(data.treatmentDoses)

  const vaccinations: PdfVaccinationRow[] = data.vaccinations
    .filter((item) => item.animalId === animalId)
    .flatMap((item) => {
      const history = injections.get(item.id) ?? []
      const head = history[0]
      if (!head) return []
      return [
        {
          name: item.name,
          lastInjectionDate: head.injectedOn,
          injectionDates: history.map(({ injectedOn }) => injectedOn),
          dueDate: head.nextDueDate,
          state: dueState(head.nextDueDate, today, 'vaccination'),
        },
      ]
    })
    .sort(byDueDateAscending)

  const treatments: PdfTreatmentRow[] = data.treatments
    .filter((item) => item.animalId === animalId)
    .flatMap((item) => {
      const [head, ...previous] = doses.get(item.id) ?? []
      if (!head) return []
      const nextDueDate = item.stoppedOn ? null : head.nextDueDate
      return [
        {
          name: item.name,
          lastDoseDate: head.givenOn,
          previousDoses: doseSeries(previous),
          nextDueDate,
          stoppedOn: item.stoppedOn,
          state: dueState(nextDueDate, today, 'treatment'),
        },
      ]
    })
    .sort((a, b) => byDueDateAscending({ dueDate: a.nextDueDate }, { dueDate: b.nextDueDate }))

  const weightEntries: PdfWeightRow[] = data.weightEntries
    .filter((item) => item.animalId === animalId)
    .map((item) => ({ measuredOn: item.measuredOn, weightKg: item.weightKg }))
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))

  return {
    animal: {
      name: animal.name,
      species: animal.species,
      breed: animal.breed,
      birthDate: animal.birthDate,
      photoFileName: animal.photoFileName,
    },
    generatedOn: today,
    vaccinations,
    treatments,
    weightEntries,
  }
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
}

export function pdfExportFileName(label: string, animalName: string, exportedAt: Date): string {
  const parts = [slug(label), slug(animalName), format(exportedAt, EXPORT_FILE_TIME)]
  return `${parts.filter(Boolean).join('-')}.pdf`
}
