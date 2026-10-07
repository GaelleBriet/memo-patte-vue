import { differenceInCalendarDays, format, parseISO } from 'date-fns'

import { EXPORT_FILE_TIME } from './export-format'
import { treatmentOutlooks, type TreatmentOutlook } from './treatment-outlook'
import { buildReminders, type ReminderKind } from '@/shared/domain/reminders'
import type { ExportData, ExportFrequency } from '@/shared/domain/carnet-data'
import {
  currentPeriods,
  givenDoseHistories,
  vaccinationHistories,
  type GivenDose,
} from '@/shared/domain/carnet-heads'

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
  /** `extras[i]` : la prise de `dates[i]` est une prise en plus. */
  | { kind: 'dates'; dates: string[]; extras: boolean[] }
  | { kind: 'range'; count: number; from: string; to: string }

export type PdfTreatmentRow = {
  name: string
  /** `null` : aucune prise donnée. */
  lastDoseDate: string | null
  /** Les prises avant la dernière, par séries, la plus récente d'abord. */
  previousDoses: PdfDoseSeries[]
  /** La dernière prise est une prise en plus. */
  lastDoseExtra: boolean
  due: TreatmentOutlook
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

type DatedDose = { givenOn: string; frequency: ExportFrequency; extra: boolean }

// Fréquence de la période de la prise précédente : le rythme auquel la suivante est attendue.
function isSameSeries(previous: DatedDose, next: DatedDose): boolean {
  const gap = differenceInCalendarDays(parseISO(next.givenOn), parseISO(previous.givenOn))
  const period = previous.frequency.value * DAYS_PER_UNIT[previous.frequency.unit]
  return gap <= SERIES_GAP_FACTOR * period
}

function doseSeries(doses: readonly DatedDose[]): PdfDoseSeries[] {
  const series: DatedDose[][] = []
  for (const dose of [...doses].reverse()) {
    const current = series.at(-1)
    const previous = current?.at(-1)
    if (current && previous && isSameSeries(previous, dose)) current.push(dose)
    else series.push([dose])
  }
  return series.reverse().map((group): PdfDoseSeries => {
    const dates = group.map(({ givenOn }) => givenOn)
    return dates.length <= MAX_LISTED_DOSES
      ? { kind: 'dates', dates: dates.reverse(), extras: group.map(({ extra }) => extra).reverse() }
      : { kind: 'range', count: dates.length, from: dates[0]!, to: dates.at(-1)! }
  })
}

function byDueDateAscending(a: { dueDate: string | null }, b: { dueDate: string | null }): number {
  if (a.dueDate === null || b.dueDate === null) {
    return Number(a.dueDate === null) - Number(b.dueDate === null)
  }
  return a.dueDate.localeCompare(b.dueDate)
}

function treatmentState(due: TreatmentOutlook): PdfDueState {
  if (due.kind !== 'due') return 'none'
  return due.overdue ? 'overdue' : 'upToDate'
}

function dueKey(due: TreatmentOutlook): { dueDate: string | null } {
  return { dueDate: due.kind === 'due' ? `${due.dueOn} ${due.dueTime ?? ''}` : null }
}

export function buildCarnetPdfContent(
  data: ExportData,
  animalId: string,
  today: string,
): CarnetPdfContent | null {
  const animal = data.animals.find((item) => item.id === animalId)
  if (!animal) return null

  const injections = vaccinationHistories(data.vaccinationInjections)
  const doses = givenDoseHistories(data.treatmentDoses)
  const outlook = treatmentOutlooks(data, today)
  const periods = currentPeriods(data.treatmentPeriods)
  const frequencies = new Map(data.treatmentPeriods.map(({ id, frequency }) => [id, frequency]))
  const dated = ({ givenOn, periodId, status }: GivenDose): DatedDose[] => {
    const frequency = frequencies.get(periodId)
    return frequency ? [{ givenOn, frequency, extra: status === 'extra' }] : []
  }

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
      const due = outlook(item.id)
      if (!periods.has(item.id)) return []
      return [
        {
          name: item.name,
          lastDoseDate: head?.givenOn ?? null,
          previousDoses: doseSeries(previous.flatMap(dated)),
          lastDoseExtra: head?.status === 'extra',
          due,
          state: treatmentState(due),
        },
      ]
    })
    .sort((a, b) => byDueDateAscending(dueKey(a.due), dueKey(b.due)))

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
