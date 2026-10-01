import { format } from 'date-fns'
import { strToU8, zipSync, type Zippable } from 'fflate'

import type { ExportData, ExportTreatment } from '@/shared/domain/carnet-data'
import {
  currentPeriods,
  givenDoseHistories,
  treatmentHeads,
  vaccinationHeads,
} from '@/shared/domain/carnet-heads'
import { recordedWeightIn, type WeightUnit } from '@/shared/domain/weight-unit'

/** Contrat documenté dans `docs/technical/export-format.md` : toute rupture incrémente la version. */
export const EXPORT_SCHEMA_VERSION = 3

export type ExportFormat = 'json' | 'csv'

export type ExportReminder = {
  kind: 'vaccination' | 'treatment'
  sourceId: string
  animalId: string
  name: string
  dueDate: string
}

export type ExportMeta = {
  exportedAt: Date
  appVersion: string
}

export type ExportFile = {
  name: string
  content: string | Uint8Array
}

/** Minute locale de l'export, sur 24 h : deux exports d'un même jour ne portent pas le même nom. */
export const EXPORT_FILE_TIME = 'yyyyMMdd-HHmm'

export function exportFileName(exportFormat: ExportFormat, exportedAt: Date): string {
  const extension = exportFormat === 'json' ? 'json' : 'zip'
  return `memopatte-export-${format(exportedAt, EXPORT_FILE_TIME)}.${extension}`
}

/**
 * Prochaine échéance de chaque traitement en cours : celle que fixe la dernière ligne de sa période
 * en cours, sa première échéance tant qu'elle n'a aucune ligne. Rien pour un traitement arrêté, ou
 * dont la date de fin est passée.
 */
function nextDueDates(data: ExportData): (treatment: ExportTreatment) => string | null {
  const periods = currentPeriods(data.treatmentPeriods)
  return (treatment) => {
    const period = periods.get(treatment.id)
    if (!period || period.stoppedOn) return null
    const head = treatmentHeads(
      data.treatmentDoses.filter(({ periodId }) => periodId === period.id),
    ).get(treatment.id)
    const dueDate = head?.nextDueDate ?? period.firstDueOn
    return period.endsOn !== null && dueDate > period.endsOn ? null : dueDate
  }
}

export function exportReminders(data: ExportData): ExportReminder[] {
  const injections = vaccinationHeads(data.vaccinationInjections)
  const nextDueDate = nextDueDates(data)
  const reminders: ExportReminder[] = [
    ...data.vaccinations.flatMap((vaccination): ExportReminder[] => {
      const head = injections.get(vaccination.id)
      const dueDate = head ? head.nextDueDate : vaccination.plannedDueDate
      return dueDate
        ? [
            {
              kind: 'vaccination',
              sourceId: vaccination.id,
              animalId: vaccination.animalId,
              name: vaccination.name,
              dueDate,
            },
          ]
        : []
    }),
    ...data.treatments.flatMap((treatment): ExportReminder[] => {
      const dueDate = nextDueDate(treatment)
      return dueDate
        ? [
            {
              kind: 'treatment',
              sourceId: treatment.id,
              animalId: treatment.animalId,
              name: treatment.name,
              dueDate,
            },
          ]
        : []
    }),
  ]
  return reminders.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name),
  )
}

export function toJsonExport(data: ExportData, meta: ExportMeta): string {
  const document = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: meta.exportedAt.toISOString(),
    appVersion: meta.appVersion,
    carnetSettings: data.carnetSettings,
    animals: data.animals,
    vaccinations: data.vaccinations,
    vaccinationInjections: data.vaccinationInjections,
    treatments: data.treatments,
    treatmentPeriods: data.treatmentPeriods,
    treatmentDoses: data.treatmentDoses,
    weightEntries: data.weightEntries,
    reminders: exportReminders(data),
  }
  return JSON.stringify(document, null, 2)
}

type CsvValue = string | number | boolean | null

const UTF8_BOM = '\uFEFF'
const CSV_SEPARATOR = ';'
const CSV_NEEDS_QUOTES = /[;"\r\n]/
/** Un tableur exécuterait ces cellules comme des formules (injection CSV, OWASP). */
const CSV_FORMULA_START = /^[=+\-@\t\r]/

function csvCell(value: CsvValue): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value).replace('.', ',')
  if (typeof value === 'boolean') return String(value)
  const text = CSV_FORMULA_START.test(value) ? `'${value}` : value
  return CSV_NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(CSV_SEPARATOR))
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

export type CsvTables = {
  'animaux.csv': string
  'vaccins.csv': string
  'injections.csv': string
  'traitements.csv': string
  'periodes.csv': string
  'prises.csv': string
  'poids.csv': string
  'rappels.csv': string
}

function namesById(rows: { id: string; name: string }[]): (id: string) => string | null {
  const names = new Map(rows.map(({ id, name }) => [id, name]))
  return (id) => names.get(id) ?? null
}

const WEIGHT_COLUMNS: Record<WeightUnit, string> = { kg: 'weightKg', lb: 'weightLb' }

/** Poids dans l'unité choisie, nommée par le titre de colonne ; le JSON reste en kg. */
export function toCsvTables(data: ExportData, weightUnit: WeightUnit): CsvTables {
  const weightColumn = WEIGHT_COLUMNS[weightUnit]
  const animalName = namesById(data.animals)
  const vaccinationName = namesById(data.vaccinations)
  const treatmentName = namesById(data.treatments)
  const injections = vaccinationHeads(data.vaccinationInjections)
  const givenDoses = givenDoseHistories(data.treatmentDoses)
  const nextDueDate = nextDueDates(data)

  return {
    'animaux.csv': csv(
      [
        'id',
        'name',
        'species',
        'breed',
        'birthDate',
        'birthDateApproximate',
        'unfollowedOn',
        'departureReason',
        'departureDate',
        'createdAt',
        'updatedAt',
      ],
      data.animals.map((animal) => [
        animal.id,
        animal.name,
        animal.species,
        animal.breed,
        animal.birthDate,
        animal.birthDateApproximate,
        animal.unfollowedOn,
        animal.departureReason,
        animal.departureDate,
        animal.createdAt,
        animal.updatedAt,
      ]),
    ),
    'vaccins.csv': csv(
      ['id', 'animalId', 'animalName', 'name', 'plannedDueDate', 'lastInjectionDate', 'dueDate'],
      data.vaccinations.map((vaccination) => {
        const head = injections.get(vaccination.id)
        return [
          vaccination.id,
          vaccination.animalId,
          animalName(vaccination.animalId),
          vaccination.name,
          vaccination.plannedDueDate,
          head?.injectedOn ?? null,
          head ? head.nextDueDate : vaccination.plannedDueDate,
        ]
      }),
    ),
    'injections.csv': csv(
      [
        'id',
        'vaccinationId',
        'vaccinationName',
        'animalId',
        'animalName',
        'injectedOn',
        'nextDueDate',
      ],
      data.vaccinationInjections.map((injection) => [
        injection.id,
        injection.vaccinationId,
        vaccinationName(injection.vaccinationId),
        injection.animalId,
        animalName(injection.animalId),
        injection.injectedOn,
        injection.nextDueDate,
      ]),
    ),
    'traitements.csv': csv(
      ['id', 'animalId', 'animalName', 'name', 'type', 'lastDoseDate', 'nextDueDate'],
      data.treatments.map((treatment) => [
        treatment.id,
        treatment.animalId,
        animalName(treatment.animalId),
        treatment.name,
        treatment.type,
        givenDoses.get(treatment.id)?.[0]?.givenOn ?? null,
        nextDueDate(treatment),
      ]),
    ),
    'periodes.csv': csv(
      [
        'id',
        'treatmentId',
        'treatmentName',
        'animalId',
        'animalName',
        'startsOn',
        'firstDueOn',
        'endsOn',
        'stoppedOn',
        'frequencyValue',
        'frequencyUnit',
        'times',
        'doseQuantity',
        'doseUnit',
        'reminderOffsetMinutes',
        'reminderTime',
      ],
      data.treatmentPeriods.map((period) => [
        period.id,
        period.treatmentId,
        treatmentName(period.treatmentId),
        period.animalId,
        animalName(period.animalId),
        period.startsOn,
        period.firstDueOn,
        period.endsOn,
        period.stoppedOn,
        period.frequency.value,
        period.frequency.unit,
        period.times.length > 0 ? period.times.join(', ') : null,
        period.doseQuantity,
        period.doseUnit,
        period.reminderOffsetMinutes,
        period.reminderTime,
      ]),
    ),
    'prises.csv': csv(
      [
        'id',
        'periodId',
        'treatmentId',
        'treatmentName',
        'animalId',
        'animalName',
        'dueOn',
        'dueTime',
        'givenOn',
        'status',
        'nextDueDate',
      ],
      data.treatmentDoses.map((dose) => [
        dose.id,
        dose.periodId,
        dose.treatmentId,
        treatmentName(dose.treatmentId),
        dose.animalId,
        animalName(dose.animalId),
        dose.dueOn,
        dose.dueTime,
        dose.givenOn,
        dose.status,
        dose.nextDueDate,
      ]),
    ),
    'poids.csv': csv(
      ['id', 'animalId', 'animalName', 'measuredOn', weightColumn],
      data.weightEntries.map((entry) => [
        entry.id,
        entry.animalId,
        animalName(entry.animalId),
        entry.measuredOn,
        recordedWeightIn(entry.weightKg, weightUnit),
      ]),
    ),
    'rappels.csv': csv(
      ['kind', 'sourceId', 'animalId', 'animalName', 'name', 'dueDate'],
      exportReminders(data).map((reminder) => [
        reminder.kind,
        reminder.sourceId,
        reminder.animalId,
        animalName(reminder.animalId),
        reminder.name,
        reminder.dueDate,
      ]),
    ),
  }
}

export function buildExportFile(
  exportFormat: ExportFormat,
  data: ExportData,
  meta: ExportMeta,
  weightUnit: WeightUnit,
): ExportFile {
  const name = exportFileName(exportFormat, meta.exportedAt)

  if (exportFormat === 'json') {
    return { name, content: toJsonExport(data, meta) }
  }

  const entries: Zippable = {}
  for (const [fileName, content] of Object.entries(toCsvTables(data, weightUnit))) {
    entries[fileName] = [strToU8(content), { mtime: meta.exportedAt }]
  }
  return { name, content: zipSync(entries) }
}
