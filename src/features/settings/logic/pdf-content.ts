import { format } from 'date-fns'

import { EXPORT_FILE_TIME } from './export-format'
import { buildReminders, type ReminderKind } from '@/shared/domain/reminders'
import type { ExportData } from '@/shared/domain/carnet-data'

export type PdfDueState = 'overdue' | 'upToDate' | 'none'

export type PdfVaccinationRow = {
  name: string
  lastInjectionDate: string
  dueDate: string | null
  state: PdfDueState
}

export type PdfTreatmentRow = {
  name: string
  lastDoseDate: string
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

  const vaccinations: PdfVaccinationRow[] = data.vaccinations
    .filter((item) => item.animalId === animalId)
    .map((item) => ({
      name: item.name,
      lastInjectionDate: item.lastInjectionDate,
      dueDate: item.dueDate,
      state: dueState(item.dueDate, today, 'vaccination'),
    }))
    .sort(byDueDateAscending)

  const treatments: PdfTreatmentRow[] = data.treatments
    .filter((item) => item.animalId === animalId)
    .map((item) => {
      const nextDueDate = item.stoppedOn ? null : item.nextDueDate
      return {
        name: item.name,
        lastDoseDate: item.lastDoseDate,
        nextDueDate,
        stoppedOn: item.stoppedOn ?? null,
        state: dueState(nextDueDate, today, 'treatment'),
      }
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
