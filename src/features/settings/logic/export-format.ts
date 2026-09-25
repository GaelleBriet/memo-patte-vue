import { format } from 'date-fns'
import { strToU8, zipSync, type Zippable } from 'fflate'

import type { ExportData } from '@/shared/domain/carnet-data'
import { treatmentHeads, vaccinationHeads } from '@/shared/domain/carnet-heads'
import { recordedWeightIn, type WeightUnit } from '@/shared/domain/weight-unit'

/** Contrat documenté dans `docs/technical/export-format.md` : toute rupture incrémente la version. */
export const EXPORT_SCHEMA_VERSION = 2

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

export function exportReminders(data: ExportData): ExportReminder[] {
  const injections = vaccinationHeads(data.vaccinationInjections)
  const doses = treatmentHeads(data.treatmentDoses)
  const reminders: ExportReminder[] = [
    ...data.vaccinations.flatMap((vaccination): ExportReminder[] => {
      const dueDate = injections.get(vaccination.id)?.nextDueDate
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
      const dueDate = doses.get(treatment.id)?.nextDueDate
      return dueDate && !treatment.stoppedOn
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
    animals: data.animals,
    vaccinations: data.vaccinations,
    vaccinationInjections: data.vaccinationInjections,
    treatments: data.treatments,
    treatmentDoses: data.treatmentDoses,
    weightEntries: data.weightEntries,
    reminders: exportReminders(data),
  }
  return JSON.stringify(document, null, 2)
}

type CsvValue = string | number | null

const UTF8_BOM = '\uFEFF'
const CSV_SEPARATOR = ';'
const CSV_NEEDS_QUOTES = /[;"\r\n]/
/** Un tableur exécuterait ces cellules comme des formules (injection CSV, OWASP). */
const CSV_FORMULA_START = /^[=+\-@\t\r]/

function csvCell(value: CsvValue): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value).replace('.', ',')
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
  'prises.csv': string
  'poids.csv': string
  'rappels.csv': string
}

function namesById(rows: { id: string; name: string }[]): (id: string) => string | null {
  const names = new Map(rows.map(({ id, name }) => [id, name]))
  return (id) => names.get(id) ?? null
}

const WEIGHT_COLUMNS: Record<WeightUnit, { initial: string; entry: string }> = {
  kg: { initial: 'initialWeightKg', entry: 'weightKg' },
  lb: { initial: 'initialWeightLb', entry: 'weightLb' },
}

/** Poids dans l'unité choisie, nommée par le titre de colonne ; le JSON reste en kg. */
export function toCsvTables(data: ExportData, weightUnit: WeightUnit): CsvTables {
  const weightColumns = WEIGHT_COLUMNS[weightUnit]
  const weight = (kg: number | null) => (kg === null ? null : recordedWeightIn(kg, weightUnit))
  const animalName = namesById(data.animals)
  const vaccinationName = namesById(data.vaccinations)
  const treatmentName = namesById(data.treatments)
  const injections = vaccinationHeads(data.vaccinationInjections)
  const doses = treatmentHeads(data.treatmentDoses)

  return {
    'animaux.csv': csv(
      [
        'id',
        'name',
        'species',
        'breed',
        'birthDate',
        weightColumns.initial,
        'createdAt',
        'updatedAt',
      ],
      data.animals.map((animal) => [
        animal.id,
        animal.name,
        animal.species,
        animal.breed,
        animal.birthDate,
        weight(animal.initialWeightKg),
        animal.createdAt,
        animal.updatedAt,
      ]),
    ),
    'vaccins.csv': csv(
      ['id', 'animalId', 'animalName', 'name', 'lastInjectionDate', 'dueDate'],
      data.vaccinations.map((vaccination) => [
        vaccination.id,
        vaccination.animalId,
        animalName(vaccination.animalId),
        vaccination.name,
        injections.get(vaccination.id)?.injectedOn ?? null,
        injections.get(vaccination.id)?.nextDueDate ?? null,
      ]),
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
      [
        'id',
        'animalId',
        'animalName',
        'name',
        'type',
        'frequencyValue',
        'frequencyUnit',
        'lastDoseDate',
        'nextDueDate',
      ],
      data.treatments.map((treatment) => [
        treatment.id,
        treatment.animalId,
        animalName(treatment.animalId),
        treatment.name,
        treatment.type,
        treatment.frequency.value,
        treatment.frequency.unit,
        doses.get(treatment.id)?.givenOn ?? null,
        doses.get(treatment.id)?.nextDueDate ?? null,
      ]),
    ),
    'prises.csv': csv(
      [
        'id',
        'treatmentId',
        'treatmentName',
        'animalId',
        'animalName',
        'givenOn',
        'nextDueDate',
        'frequencyValue',
        'frequencyUnit',
      ],
      data.treatmentDoses.map((dose) => [
        dose.id,
        dose.treatmentId,
        treatmentName(dose.treatmentId),
        dose.animalId,
        animalName(dose.animalId),
        dose.givenOn,
        dose.nextDueDate,
        dose.frequency.value,
        dose.frequency.unit,
      ]),
    ),
    'poids.csv': csv(
      ['id', 'animalId', 'animalName', 'measuredOn', weightColumns.entry],
      data.weightEntries.map((entry) => [
        entry.id,
        entry.animalId,
        animalName(entry.animalId),
        entry.measuredOn,
        weight(entry.weightKg),
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
