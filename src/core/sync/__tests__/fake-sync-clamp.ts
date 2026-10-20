import type { SyncRowValue } from '@/core/supabase/guarded-upsert'
import { gridWrittenOf, withWrittenAt, type GridWritten } from './fake-grid-before'

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

/** Les dates de grille d'une période, en microsecondes : la colonne et celle de sa grille d'avant. */
export function gridDatesOf(period: ServerRow, nowMs: number): number[] {
  const column = typeof period.grid_written_at === 'string' ? [micros(period.grid_written_at)] : []
  const before = gridWrittenOf(period.grid_before, nowMs)
  return before ? [...column, before.us] : column
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
  /** Pour une période : les dates de grille des autres périodes de son traitement, du même compte. */
  heldGridDates: readonly number[] | null = null,
): ServerRow | null {
  const createdAt = typeof stored?.created_at === 'string' ? [micros(stored.created_at)] : []
  const bound = truncMs(nowMs * 1000 + SERVER_MICROSECONDS) + DAY_US
  const held =
    heldGridDates &&
    new Set([...heldGridDates, ...createdAt].map(truncMs).filter((us) => us <= bound))
  const isHeld = (us: number) => held?.has(truncMs(us)) ?? false
  const written = DATED.filter(
    (column) =>
      typeof incoming[column] === 'string' &&
      (typeof stored?.[column] !== 'string' ||
        truncMs(micros(stored[column])) !== truncMs(micros(incoming[column]!))) &&
      !(column === 'grid_written_at' && isHeld(micros(incoming[column]!))),
  )

  const changedGrid = changedGridWritten(incoming, stored, nowMs)
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

/** La date de grille de `grid_before`, quand l'écriture change la colonne et cette date. */
function changedGridWritten(
  incoming: ServerRow,
  stored: ServerRow | null,
  nowMs: number,
): GridWritten | null {
  const text = incoming.grid_before
  if (typeof text !== 'string' || text === (stored?.grid_before ?? null)) return null
  const written = gridWrittenOf(text, nowMs)
  const before = gridWrittenOf(stored?.grid_before, nowMs)
  if (written === null || (before !== null && truncMs(before.us) === truncMs(written.us))) {
    return null
  }
  return written
}
