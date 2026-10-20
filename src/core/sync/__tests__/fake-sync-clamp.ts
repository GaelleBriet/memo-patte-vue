import type { SyncRowValue } from '@/core/supabase/guarded-upsert'

type ServerRow = Record<string, SyncRowValue>

const DATED = ['created_at', 'updated_at', 'deleted_at', 'settings_written_at', 'grid_written_at']
const DAY_US = 24 * 60 * 60 * 1_000_000
/** Postgres date `now()` à la microseconde : le téléphone, lui, ne relit que la milliseconde. */
const SERVER_MICROSECONDS = 718

export interface ClampPush {
  sent_at: SyncRowValue
  received_at: string
}

function micros(value: SyncRowValue): number {
  const [, head, fraction = '', zone] =
    /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(String(value)) ?? []
  return Date.parse(`${head}${zone}`) * 1000 + Number(fraction.padEnd(6, '0'))
}

function iso(us: number): string {
  const rest = String(((us % 1000) + 1000) % 1000).padStart(3, '0')
  return new Date(Math.floor(us / 1000)).toISOString().replace('Z', `${rest}Z`)
}

const truncMs = (us: number) => Math.floor(us / 1000) * 1000

/** Un `timestamptz` tel que PostgREST le rend : décalage `+00:00`, fraction sans zéros de queue. */
export function postgrestInstant(value: SyncRowValue): string {
  const us = micros(value)
  const seconds = new Date(Math.floor(us / 1_000_000) * 1000).toISOString().slice(0, 19)
  const fraction = String(((us % 1_000_000) + 1_000_000) % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '')
  return `${seconds}${fraction ? `.${fraction}` : ''}+00:00`
}

/** L'heure de réception d'un envoi, telle que Postgres la date. */
export function serverInstant(nowMs: number): string {
  return iso(nowMs * 1000 + SERVER_MICROSECONDS)
}

/**
 * La règle de `clamp_sync_timestamps` (`supabase/migrations/`) : rend la ligne à écrire, dates que
 * l'écriture change décalées d'un même écart, ou `null` quand la ligne décalée n'est pas plus récente.
 */
export function clampedWrite(
  incoming: ServerRow,
  stored: ServerRow | null,
  push: ClampPush | null,
  nowMs: number,
  /** À la création d'une période, les dates de grille des autres périodes de son traitement. */
  heldGridDates: readonly SyncRowValue[] = [],
): ServerRow | null {
  const held = new Set(heldGridDates.map((value) => truncMs(micros(value))))
  const isHeld = (us: number) => stored === null && held.has(truncMs(us))
  const written = DATED.filter(
    (column) =>
      typeof incoming[column] === 'string' &&
      (typeof stored?.[column] !== 'string' ||
        truncMs(micros(stored[column])) !== truncMs(micros(incoming[column]!))) &&
      !(column === 'grid_written_at' && isHeld(micros(incoming[column]!))),
  )

  const changedGrid = changedGridWritten(incoming, stored)
  const grid = changedGrid && !isHeld(changedGrid.us) ? changedGrid : null

  const now = truncMs(nowMs * 1000 + SERVER_MICROSECONDS)
  let shift: number | null = null
  if (push && micros(push.sent_at) > micros(push.received_at) + DAY_US) {
    shift = truncMs(micros(push.received_at)) - truncMs(micros(push.sent_at))
  }
  const latest = Math.max(
    ...written.map((column) => micros(incoming[column]!)),
    ...(grid ? [grid.us] : []),
  )
  if (latest + (shift ?? 0) > now + DAY_US) shift = now - latest
  if (shift === null || (written.length === 0 && grid === null)) return incoming

  const row = { ...incoming }
  for (const column of written) row[column] = iso(micros(incoming[column]!) + shift)
  if (grid) row.grid_before = withWrittenAt(grid, grid.us + shift)
  if (stored && micros(row.updated_at!) <= micros(stored.updated_at!)) return null
  return row
}

interface GridWritten {
  text: string
  raw: string
  us: number
}

function gridWrittenOf(value: SyncRowValue | undefined): Omit<GridWritten, 'text'> | null {
  if (typeof value !== 'string') return null
  try {
    const raw: unknown = (JSON.parse(value) as { writtenAt?: unknown } | null)?.writtenAt
    if (typeof raw !== 'string' || Number.isNaN(micros(raw))) return null
    return { raw, us: micros(raw) }
  } catch {
    return null
  }
}

/** La date de grille de `grid_before`, quand l'écriture change la colonne et cette date. */
function changedGridWritten(incoming: ServerRow, stored: ServerRow | null): GridWritten | null {
  const text = incoming.grid_before
  if (typeof text !== 'string' || text === (stored?.grid_before ?? null)) return null
  const written = gridWrittenOf(text)
  const before = gridWrittenOf(stored?.grid_before)
  if (written === null || (before !== null && truncMs(before.us) === truncMs(written.us))) {
    return null
  }
  return { text, ...written }
}

function withWrittenAt({ text, raw }: GridWritten, us: number): string {
  const shiftedAt = new Date(Math.floor(us / 1000)).toISOString()
  const replaced = text.replace(
    `"writtenAt":${JSON.stringify(raw)}`,
    `"writtenAt":${JSON.stringify(shiftedAt)}`,
  )
  return replaced !== text
    ? replaced
    : JSON.stringify({ ...JSON.parse(text), writtenAt: shiftedAt })
}
