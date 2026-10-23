import { format } from 'date-fns'
import { toDay } from '@/shared/domain/calendar-day'
import { strToU8, zipSync, type Zippable } from 'fflate'

import type { AppLocale } from '@/core/i18n'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { WeightUnit } from '@/shared/domain/weight-unit'

import { toCsvTables } from './export-csv'
import { exportReminders } from './export-reminders'

/** Contrat documenté dans `docs/technical/export-format.md` : toute rupture incrémente la version. */
export const EXPORT_SCHEMA_VERSION = 10

export type ExportFormat = 'json' | 'csv'

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
    reminders: exportReminders(data, toDay(meta.exportedAt)),
  }
  return JSON.stringify(document, null, 2)
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
  const today = toDay(meta.exportedAt)
  for (const [fileName, content] of Object.entries(toCsvTables(data, weightUnit, today, locale))) {
    entries[fileName] = [strToU8(content), { mtime: meta.exportedAt }]
  }
  return { name, content: zipSync(entries) }
}
