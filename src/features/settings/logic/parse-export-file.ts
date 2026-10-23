import { toDay } from '@/shared/domain/calendar-day'
import type { z } from 'zod'

import { currentDeviceId } from '@/core/device/device-identity'
import type { ImportFile } from '@/shared/domain/import-plan'
import {
  exportFileSchemaOf,
  exportHeaderSchema,
  exportVersionSchema,
} from '../schema/export-file.schema'
import { everyTreatmentReadable, withGridDatesClamped } from './export-file-versions'
import { EXPORT_SCHEMA_VERSION } from './export-format'

export type ImportFileError = 'invalid' | 'newer' | 'outOfRange' | 'nameTooLong'

export type ParsedExportFile =
  { ok: true; file: ImportFile } | { ok: false; reason: ImportFileError }

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const BOUNDED_FIELDS = [['weightKg'], ['initialWeightKg'], ['frequency', 'value']]
const NAME_FIELDS = [['name'], ['breed']]

function endsWith(path: PropertyKey[], suffix: string[]): boolean {
  return suffix.every((segment, index) => path[path.length - suffix.length + index] === segment)
}

function onlyTooBig(error: z.ZodError, fields: string[][]): boolean {
  return error.issues.every(
    (issue) => issue.code === 'too_big' && fields.some((suffix) => endsWith(issue.path, suffix)),
  )
}

function refusalReason(error: z.ZodError): ImportFileError {
  if (onlyTooBig(error, NAME_FIELDS)) return 'nameTooLong'
  return onlyTooBig(error, BOUNDED_FIELDS) ? 'outOfRange' : 'invalid'
}

/**
 * La version tranche avant toute validation ; un ancien export est converti au format courant (plan
 * §3.3, #469), signé par `deviceId` quand il n'a pas d'appareil, puis relu par le moteur (Q40).
 */
export function parseExportFile(
  text: string,
  deviceId: string = currentDeviceId(),
  today: string = toDay(new Date()),
): ParsedExportFile {
  const document = parseJson(text)

  const version = exportVersionSchema.safeParse(document)
  if (!version.success) return { ok: false, reason: 'invalid' }
  const { schemaVersion } = version.data
  if (schemaVersion > EXPORT_SCHEMA_VERSION) return { ok: false, reason: 'newer' }

  const header = exportHeaderSchema.safeParse(document)
  if (!header.success) return { ok: false, reason: refusalReason(header.error) }
  const parsed = exportFileSchemaOf(schemaVersion, deviceId, today).safeParse(document)
  if (!parsed.success) return { ok: false, reason: refusalReason(parsed.error) }
  const data = withGridDatesClamped(parsed.data, header.data.exportedAt)
  if (!everyTreatmentReadable(data, today)) return { ok: false, reason: 'invalid' }

  return { ok: true, file: { schemaVersion: EXPORT_SCHEMA_VERSION, data } }
}
