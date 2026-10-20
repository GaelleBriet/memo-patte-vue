import type { SyncRowValue } from '@/core/supabase/guarded-upsert'

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?Z$/
const HUNDRED_YEARS_MS = 100 * 365.25 * 24 * 60 * 60 * 1000

/** Comme `pg_input_is_valid(…, 'timestamptz')` sur ce format, puis la plage que le serveur sait décaler. */
function strictInstant(raw: string, nowMs: number): number | null {
  const parts = ISO.exec(raw)
  if (!parts) return null
  const [year, month, day, hour, minute, second = 0] = parts.slice(1, 7).map(Number)
  const ms = Date.UTC(year!, month! - 1, day!, hour!, minute!, second)
  const back = new Date(ms)
  const exact =
    back.getUTCFullYear() === year &&
    back.getUTCMonth() === month! - 1 &&
    back.getUTCDate() === day &&
    hour! < 24 &&
    minute! < 60 &&
    second < 60
  if (!exact) return null
  const at = Date.parse(raw)
  return year! >= 1900 && at <= nowMs + HUNDRED_YEARS_MS ? at : null
}

export interface GridWritten {
  text: string
  raw: string
  us: number
}

function parsed(value: SyncRowValue | undefined): unknown {
  if (typeof value !== 'string') return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** La date de `writtenAt` en microsecondes, seulement au format ISO strict de l'app, comme le serveur. */
export function gridWrittenOf(value: SyncRowValue | undefined, nowMs: number): GridWritten | null {
  const grid = parsed(value)
  const raw = (grid as { writtenAt?: unknown } | null | undefined)?.writtenAt
  const at = typeof raw === 'string' ? strictInstant(raw, nowMs) : null
  return at === null ? null : { text: value as string, raw: raw as string, us: at * 1000 }
}

/** Un JSON tel que Postgres le rend en `jsonb::text` : clés courtes d'abord, espaces après `:` et `,`. */
function pgJsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pgJsonbText).join(', ')}]`
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => a.length - b.length || (a < b ? -1 : 1))
    const record = value as Record<string, unknown>
    return `{${keys.map((key) => `${JSON.stringify(key)}: ${pgJsonbText(record[key])}`).join(', ')}}`
  }
  return JSON.stringify(value)
}

/** La règle du serveur : la seule clé de premier niveau change, le texte gardé s'il ne dit rien d'autre. */
export function withWrittenAt({ text, raw }: GridWritten, us: number): string {
  const shiftedAt = new Date(Math.floor(us / 1000)).toISOString()
  const expected = pgJsonbText({ ...(JSON.parse(text) as object), writtenAt: shiftedAt })
  const oldPiece = `"writtenAt":${JSON.stringify(raw)}`
  const at = text.indexOf(oldPiece)
  if (at >= 0) {
    const candidate = `${text.slice(0, at)}"writtenAt":${JSON.stringify(shiftedAt)}${text.slice(at + oldPiece.length)}`
    if (pgJsonbText(parsed(candidate)) === expected) return candidate
  }
  return expected
}
