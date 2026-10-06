import { format, parseISO } from 'date-fns'
import { strToU8, zipSync, type Zippable } from 'fflate'

import { outlookDueDate, treatmentOutlooks } from './treatment-outlook'
import i18n, { type AppLocale } from '@/core/i18n'
import type { ExportData, ExportDoseUnit } from '@/shared/domain/carnet-data'
import { givenDoseHistories, vaccinationHeads } from '@/shared/domain/carnet-heads'
import { doseUnitText } from '@/shared/domain/dosage'
import { recordedWeightIn, type WeightUnit } from '@/shared/domain/weight-unit'

/** Contrat documenté dans `docs/technical/export-format.md` : toute rupture incrémente la version. */
export const EXPORT_SCHEMA_VERSION = 4

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

/** `today` : `yyyy-MM-dd`, jour de l'export ; les échéances des traitements viennent du moteur. */
export function exportReminders(data: ExportData, today: string): ExportReminder[] {
  const injections = vaccinationHeads(data.vaccinationInjections)
  const outlook = treatmentOutlooks(data, today)
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
      const dueDate = outlookDueDate(outlook(treatment.id))
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
    devices: data.devices,
    reminders: exportReminders(data, format(meta.exportedAt, 'yyyy-MM-dd')),
  }
  return JSON.stringify(document, null, 2)
}

type CsvValue = string | number | null

type CsvDialect = { separator: string; decimal: string; needsQuotes: RegExp }

/** Le séparateur de liste et la virgule décimale qu'attend un tableur réglé dans cette langue. */
const CSV_DIALECTS: Record<AppLocale, CsvDialect> = {
  fr: { separator: ';', decimal: ',', needsQuotes: /[;"\r\n]/ },
  en: { separator: ',', decimal: '.', needsQuotes: /[,"\r\n]/ },
}

const UTF8_BOM = '\uFEFF'
/** Un tableur exécuterait ces cellules comme des formules (injection CSV, OWASP). */
const CSV_FORMULA_START = /^[=+\-@\t\r]/

function csvCell(value: CsvValue, dialect: CsvDialect): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value).replace('.', dialect.decimal)
  const text = CSV_FORMULA_START.test(value) ? `'${value}` : value
  return dialect.needsQuotes.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

type CsvLabels = {
  column: (key: string, named?: Record<string, unknown>) => string
  value: (key: string, count?: number) => string
  doseUnit: (unit: ExportDoseUnit, quantity: number) => string
}

function csvLabels(locale: AppLocale): CsvLabels {
  const t = (key: string, named: Record<string, unknown>, plural: number): string =>
    i18n.global.t(key, named, { locale, plural })
  return {
    column: (key, named = {}) => t(`settings.csv.columns.${key}`, named, 1),
    value: (key, count = 1) => t(`settings.csv.values.${key}`, {}, count),
    doseUnit: (unit, quantity) => doseUnitText(t, unit, quantity),
  }
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

/** Un instant à l'heure locale, sans `T` ni `Z`, pour qu'un tableur le lise comme une date. */
function csvLocalTime(instant: string): string {
  return format(parseISO(instant), 'yyyy-MM-dd HH:mm:ss')
}

function namesById(rows: { id: string; name: string }[]): (id: string) => string | null {
  const names = new Map(rows.map(({ id, name }) => [id, name]))
  return (id) => names.get(id) ?? null
}

/** Titres, valeurs codées et nombres dans la langue de l'app ; poids dans l'unité choisie. */
export function toCsvTables(
  data: ExportData,
  weightUnit: WeightUnit,
  today: string,
  locale: AppLocale,
): CsvTables {
  const dialect = CSV_DIALECTS[locale]
  const { column, value, doseUnit } = csvLabels(locale)
  const csv = (columns: string[], rows: (CsvValue | boolean)[][]): string => {
    const header = columns.map((key) => column(key, { unit: weightUnit }))
    const lines = [header, ...rows].map((row) =>
      row
        .map((cell) => (typeof cell === 'boolean' ? value(`boolean.${cell}`) : cell))
        .map((cell) => csvCell(cell, dialect))
        .join(dialect.separator),
    )
    return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
  }
  const animalName = namesById(data.animals)
  const vaccinationName = namesById(data.vaccinations)
  const treatmentName = namesById(data.treatments)
  const injections = vaccinationHeads(data.vaccinationInjections)
  const givenDoses = givenDoseHistories(data.treatmentDoses)
  const outlook = treatmentOutlooks(data, today)

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
        value(`species.${animal.species}`),
        animal.breed,
        animal.birthDate,
        animal.birthDateApproximate,
        animal.unfollowedOn,
        animal.departureReason && value(`departureReason.${animal.departureReason}`),
        animal.departureDate,
        csvLocalTime(animal.createdAt),
        csvLocalTime(animal.updatedAt),
      ]),
    ),
    'vaccins.csv': csv(
      [
        'id',
        'animalId',
        'animalName',
        'vaccinationName',
        'plannedDueDate',
        'lastInjectionDate',
        'nextReminder',
      ],
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
        'nextReminder',
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
      ['id', 'animalId', 'animalName', 'treatmentName', 'type', 'lastDoseDate', 'nextDose'],
      data.treatments.map((treatment) => [
        treatment.id,
        treatment.animalId,
        animalName(treatment.animalId),
        treatment.name,
        value(`treatmentType.${treatment.type}`),
        givenDoses.get(treatment.id)?.[0]?.givenOn ?? null,
        outlookDueDate(outlook(treatment.id)),
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
        value(`frequencyUnit.${period.frequency.unit}`, period.frequency.value),
        period.times.length > 0 ? period.times.join(', ') : null,
        period.doseQuantity,
        period.doseUnit && doseUnit(period.doseUnit, period.doseQuantity ?? 1),
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
        value(`doseStatus.${dose.status}`),
        dose.nextDueDate,
      ]),
    ),
    'poids.csv': csv(
      ['id', 'animalId', 'animalName', 'measuredOn', 'weight'],
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
      exportReminders(data, today).map((reminder) => [
        value(`reminderKind.${reminder.kind}`),
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
  locale: AppLocale,
): ExportFile {
  const name = exportFileName(exportFormat, meta.exportedAt)

  if (exportFormat === 'json') {
    return { name, content: toJsonExport(data, meta) }
  }

  const entries: Zippable = {}
  const today = format(meta.exportedAt, 'yyyy-MM-dd')
  for (const [fileName, content] of Object.entries(toCsvTables(data, weightUnit, today, locale))) {
    entries[fileName] = [strToU8(content), { mtime: meta.exportedAt }]
  }
  return { name, content: zipSync(entries) }
}
