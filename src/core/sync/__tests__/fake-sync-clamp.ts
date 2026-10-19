import type { SyncRowValue } from '@/core/supabase/guarded-upsert'

type ServerRow = Record<string, SyncRowValue>

const DATED = ['created_at', 'updated_at', 'deleted_at', 'settings_written_at', 'grid_written_at']
const TOLERANCE = 24 * 60 * 60 * 1000

export interface ClampPush {
  sent_at: SyncRowValue
  received_at: string
}

const instant = (value: SyncRowValue) => Date.parse(String(value))

/**
 * La règle de `clamp_sync_timestamps` (`supabase/migrations/`) : rend la ligne à écrire, dates que
 * l'écriture change décalées d'un même écart, ou `null` quand la ligne décalée n'est pas plus récente.
 */
export function clampedWrite(
  incoming: ServerRow,
  stored: ServerRow | null,
  push: ClampPush | null,
  now: number,
): ServerRow | null {
  const written = DATED.filter(
    (column) =>
      typeof incoming[column] === 'string' &&
      (typeof stored?.[column] !== 'string' ||
        instant(stored[column]) !== instant(incoming[column]!)),
  )

  let shift: number | null = null
  const ahead = push ? instant(push.sent_at) - instant(push.received_at) : 0
  if (ahead > TOLERANCE) shift = -ahead
  if (shift === null) {
    const latest = Math.max(...written.map((column) => instant(incoming[column]!)))
    if (latest > now + TOLERANCE) shift = now - latest
  }
  if (shift === null) return incoming

  const row = { ...incoming }
  for (const column of written) {
    row[column] = new Date(instant(incoming[column]!) + shift).toISOString()
  }
  if (stored && instant(row.updated_at!) <= instant(stored.updated_at!)) return null
  return row
}
