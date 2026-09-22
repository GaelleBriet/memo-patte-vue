import type { SyncRow } from '@/core/supabase/guarded-upsert'

const TIMESTAMP_COLUMNS = ['created_at', 'updated_at', 'deleted_at']

/**
 * PostgREST rend un `timestamptz` en `+00:00`, jamais en `Z` : la garde locale compare des chaînes
 * (§1.3 de la proposition), donc toute ligne distante doit reprendre le format `toISOString()` avant
 * d'entrer dans la comparaison, sous peine de résultat faux malgré des instants égaux.
 */
export function normalizeSyncTimestamps(row: SyncRow): SyncRow {
  const normalized = { ...row }
  for (const column of TIMESTAMP_COLUMNS) {
    const value = normalized[column]
    if (typeof value === 'string') normalized[column] = new Date(value).toISOString()
  }
  return normalized
}
