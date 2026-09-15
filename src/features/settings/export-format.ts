import { format } from 'date-fns'
import { strToU8, zipSync, type Zippable } from 'fflate'

/** Contrat documenté dans `docs/technical/export-format.md` : toute rupture incrémente la version. */
export const EXPORT_SCHEMA_VERSION = 1

export type ExportFormat = 'json' | 'csv'

export type ExportAnimal = {
  id: string
  name: string
  species: 'dog' | 'cat'
  breed: string | null
  birthDate: string | null
  initialWeightKg: number | null
  photoFileName: string | null
  createdAt: string
  updatedAt: string
}

export type ExportVaccination = {
  id: string
  animalId: string
  name: string
  lastInjectionDate: string
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

export type ExportTreatment = {
  id: string
  animalId: string
  name: string
  type: 'deworming' | 'antiparasitic'
  frequency: { value: number; unit: 'day' | 'week' | 'month' }
  lastDoseDate: string
  nextDueDate: string
  createdAt: string
  updatedAt: string
}

export type ExportWeightEntry = {
  id: string
  animalId: string
  weightKg: number
  measuredOn: string
  createdAt: string
  updatedAt: string
}

export type ExportReminder = {
  kind: 'vaccination' | 'treatment'
  sourceId: string
  animalId: string
  name: string
  dueDate: string
}

export type ExportData = {
  animals: ExportAnimal[]
  vaccinations: ExportVaccination[]
  treatments: ExportTreatment[]
  weightEntries: ExportWeightEntry[]
}

export type ExportMeta = {
  exportedAt: Date
  appVersion: string
}

export type ExportFile = {
  name: string
  mimeType: string
  content: string | Uint8Array
}

export function exportFileName(exportFormat: ExportFormat, exportedAt: Date): string {
  const extension = exportFormat === 'json' ? 'json' : 'zip'
  return `memopatte-export-${format(exportedAt, 'yyyy-MM-dd')}.${extension}`
}

export function exportReminders(data: ExportData): ExportReminder[] {
  const reminders: ExportReminder[] = [
    ...data.vaccinations.flatMap((vaccination): ExportReminder[] =>
      vaccination.dueDate === null
        ? []
        : [
            {
              kind: 'vaccination',
              sourceId: vaccination.id,
              animalId: vaccination.animalId,
              name: vaccination.name,
              dueDate: vaccination.dueDate,
            },
          ],
    ),
    ...data.treatments.map((treatment): ExportReminder => ({
      kind: 'treatment',
      sourceId: treatment.id,
      animalId: treatment.animalId,
      name: treatment.name,
      dueDate: treatment.nextDueDate,
    })),
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
    treatments: data.treatments,
    weightEntries: data.weightEntries,
    reminders: exportReminders(data),
  }
  return JSON.stringify(document, null, 2)
}

type CsvValue = string | number | null

const UTF8_BOM = '\uFEFF'
const CSV_SEPARATOR = ';'
const CSV_NEEDS_QUOTES = /[;"\r\n]/

function csvCell(value: CsvValue): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value).replace('.', ',')
  return CSV_NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function csv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(CSV_SEPARATOR))
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

export type CsvTables = {
  'animaux.csv': string
  'vaccins.csv': string
  'traitements.csv': string
  'poids.csv': string
  'rappels.csv': string
}

export function toCsvTables(data: ExportData): CsvTables {
  const names = new Map(data.animals.map((animal) => [animal.id, animal.name]))
  const animalName = (animalId: string): string | null => names.get(animalId) ?? null

  return {
    'animaux.csv': csv(
      ['id', 'name', 'species', 'breed', 'birthDate', 'initialWeightKg', 'createdAt', 'updatedAt'],
      data.animals.map((animal) => [
        animal.id,
        animal.name,
        animal.species,
        animal.breed,
        animal.birthDate,
        animal.initialWeightKg,
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
        vaccination.lastInjectionDate,
        vaccination.dueDate,
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
        treatment.lastDoseDate,
        treatment.nextDueDate,
      ]),
    ),
    'poids.csv': csv(
      ['id', 'animalId', 'animalName', 'measuredOn', 'weightKg'],
      data.weightEntries.map((entry) => [
        entry.id,
        entry.animalId,
        animalName(entry.animalId),
        entry.measuredOn,
        entry.weightKg,
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
): ExportFile {
  const name = exportFileName(exportFormat, meta.exportedAt)

  if (exportFormat === 'json') {
    return { name, mimeType: 'application/json', content: toJsonExport(data, meta) }
  }

  const entries: Zippable = {}
  for (const [fileName, content] of Object.entries(toCsvTables(data))) {
    entries[fileName] = [strToU8(content), { mtime: meta.exportedAt }]
  }
  return { name, mimeType: 'application/zip', content: zipSync(entries) }
}
