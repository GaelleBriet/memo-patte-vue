import { format, parseISO } from 'date-fns'

import i18n, { type AppLocale } from '@/core/i18n'
import type { ExportData } from '@/shared/domain/carnet-data'
import { givenDosesByTreatment, vaccinationHeads } from '@/shared/domain/carnet-heads'
import { doseUnitText } from '@/shared/domain/dosage'
import { outlookDueDate, treatmentOutlooks } from '@/shared/domain/treatment-outlook'
import { recordedWeightIn, type WeightUnit } from '@/shared/domain/weight-unit'

import { exportReminders } from './export-reminders'

type CsvValue = string | number | boolean | null

type CsvDialect = { separator: string; decimal: string; needsQuotes: RegExp }

const CSV_DIALECTS: Record<AppLocale, CsvDialect> = {
  fr: { separator: ';', decimal: ',', needsQuotes: /[;"\r\n]/ },
  en: { separator: ',', decimal: '.', needsQuotes: /[,"\r\n]/ },
}

const UTF8_BOM = '\uFEFF'
/** Un tableur exécuterait ces cellules comme des formules (injection CSV, OWASP). */
const CSV_FORMULA_START = /^[=+\-@\t\r]/

function csvCell(value: string | number | null, dialect: CsvDialect): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value).replace('.', dialect.decimal)
  const text = CSV_FORMULA_START.test(value) ? `'${value}` : value
  return dialect.needsQuotes.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Un instant à l'heure locale, sans `T` ni `Z`, pour qu'un tableur le lise comme une date. */
function csvLocalTime(instant: string): string {
  return format(parseISO(instant), 'yyyy-MM-dd HH:mm:ss')
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

/** Titres, valeurs codées et nombres dans la langue de l'app ; poids dans l'unité choisie ; le JSON ne change pas. */
export function toCsvTables(
  data: ExportData,
  weightUnit: WeightUnit,
  today: string,
  locale: AppLocale,
): CsvTables {
  const dialect = CSV_DIALECTS[locale]
  const t = (key: string, named: Record<string, unknown>, plural: number): string =>
    i18n.global.t(key, named, { locale, plural })
  const value = (key: string, count = 1): string => t(`settings.csv.values.${key}`, {}, count)
  const csv = (columns: string[], rows: CsvValue[][]): string => {
    const header = columns.map((key) => t(`settings.csv.columns.${key}`, { unit: weightUnit }, 1))
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
  const givenDoses = givenDosesByTreatment(data.treatmentDoses)
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
        period.doseUnit && doseUnitText(i18n.global.t, period.doseUnit, period.doseQuantity ?? 1),
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
        'targetOn',
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
        dose.targetOn,
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
