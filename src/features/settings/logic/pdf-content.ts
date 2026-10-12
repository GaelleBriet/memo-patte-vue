import { format } from 'date-fns'

import { EXPORT_FILE_TIME } from './export-format'
import { lastIntake, treatmentPeriods, type PdfTreatmentPeriod } from './pdf-treatment-history'
import { treatmentStates, type TreatmentOutlook } from '@/shared/domain/treatment-outlook'
import { buildReminders, type ReminderKind } from '@/shared/domain/reminders'
import type { ExportData } from '@/shared/domain/carnet-data'
import { vaccinationHistories } from '@/shared/domain/carnet-heads'

export type {
  PdfDose,
  PdfDoseSeries,
  PdfHistoryLine,
  PdfTreatmentPeriod,
} from './pdf-treatment-history'

export type PdfDueState = 'overdue' | 'upToDate' | 'planned' | 'none'

export type PdfVaccinationRow = {
  name: string
  /** `null` : vaccin prévu, jamais fait. */
  lastInjectionDate: string | null
  /** Toutes les injections, la plus récente d'abord : un vaccin n'est jamais regroupé. */
  injectionDates: string[]
  dueDate: string | null
  /** `null` : animal qu'on ne suit plus, sans statut. */
  state: PdfDueState | null
}

export type PdfTreatmentRow = {
  name: string
  /** `null` : aucune prise donnée. */
  lastDoseDate: string | null
  /** La dernière prise est une prise en plus. */
  lastDoseExtra: boolean
  /** La plus récente d'abord. */
  periods: PdfTreatmentPeriod[]
  due: TreatmentOutlook
  /** `null` : animal qu'on ne suit plus, sans statut. */
  state: PdfDueState | null
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
    birthDateApproximate: boolean
    /** Date du départ d'un animal qu'on ne suit plus, quand elle a été renseignée. */
    departureDate: string | null
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

  const followed = animal.unfollowedOn === null
  const injections = vaccinationHistories(data.vaccinationInjections)
  const states = treatmentStates(data, today)
  const treatedIds = new Set(data.treatmentPeriods.map(({ treatmentId }) => treatmentId))

  const vaccinations: PdfVaccinationRow[] = data.vaccinations
    .filter((item) => item.animalId === animalId)
    .map((item) => {
      const history = injections.get(item.id) ?? []
      const head = history[0]
      const dueDate = head ? head.nextDueDate : item.plannedDueDate
      const state = dueState(dueDate, today, 'vaccination')
      return {
        name: item.name,
        lastInjectionDate: head?.injectedOn ?? null,
        injectionDates: history.map(({ injectedOn }) => injectedOn),
        dueDate,
        state: !followed ? null : !head && state === 'upToDate' ? 'planned' : state,
      }
    })
    .sort(byDueDateAscending)

  const treatments: PdfTreatmentRow[] = data.treatments
    .filter((item) => item.animalId === animalId && treatedIds.has(item.id))
    .map((item) => {
      const state = states(item.id)
      const periods = treatmentPeriods(state)
      const last = lastIntake(state)
      return {
        name: item.name,
        lastDoseDate: last?.on ?? null,
        lastDoseExtra: last?.extra ?? false,
        periods,
        due: state.outlook,
        state: followed ? treatmentState(state.outlook) : null,
      }
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
      birthDateApproximate: animal.birthDateApproximate,
      departureDate: animal.unfollowedOn === null ? null : animal.departureDate,
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

export function pdfExportFileName(
  label: string,
  animalNames: readonly string[],
  exportedAt: Date,
): string {
  const subject = animalNames.length === 1 ? slug(animalNames[0]!) : 'memopatte'
  const parts = [slug(label), subject, format(exportedAt, EXPORT_FILE_TIME)]
  return `${parts.filter(Boolean).join('-')}.pdf`
}
