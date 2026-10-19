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
): ServerRow | null {
  const written = DATED.filter(
    (column) =>
      typeof incoming[column] === 'string' &&
      (typeof stored?.[column] !== 'string' ||
        truncMs(micros(stored[column])) !== truncMs(micros(incoming[column]!))),
  )

  const now = truncMs(nowMs * 1000 + SERVER_MICROSECONDS)
  let shift: number | null = null
  if (push && micros(push.sent_at) > micros(push.received_at) + DAY_US) {
    shift = truncMs(micros(push.received_at)) - truncMs(micros(push.sent_at))
  }
  const latest = Math.max(...written.map((column) => micros(incoming[column]!)))
  if (latest + (shift ?? 0) > now + DAY_US) shift = now - latest
  if (shift === null) return incoming

  const row = { ...incoming }
  for (const column of written) row[column] = iso(micros(incoming[column]!) + shift)
  if (stored && micros(row.updated_at!) <= micros(stored.updated_at!)) return null
  return row
}
