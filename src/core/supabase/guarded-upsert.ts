import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncRowValue = string | number | null

export interface SyncRow extends Record<string, SyncRowValue> {
  id: string
  updated_at: string
}

export interface GuardedUpsertOptions {
  /** Colonnes de la ligne rendue, telle que le serveur l'a gardée. */
  columns: string
  /** En-têtes des écritures, lus par les déclencheurs du serveur. */
  headers?: Record<string, string>
}

/**
 * PostgREST ne sait pas exprimer `on conflict … do update … where excluded.updated_at > table.updated_at`
 * en une seule requête : la garde s'obtient par deux écritures, chacune atomique côté Postgres — une
 * mise à jour conditionnée par `updated_at`, puis une création qui ne fait rien si la ligne existe déjà.
 * Rend la ligne que le serveur a gardée : l'écrite, déclencheurs joués, ou la sienne s'il l'a refusée.
 */
export async function guardedUpsert(
  supabase: SupabaseClient,
  table: string,
  conflictColumns: string[],
  row: SyncRow,
  { columns, headers = {} }: GuardedUpsertOptions,
): Promise<SyncRow | null> {
  const match: Record<string, SyncRowValue> = Object.fromEntries(
    conflictColumns.map((column) => [column, row[column] ?? null]),
  )
  const patch = Object.fromEntries(
    Object.entries(row).filter(([column]) => !conflictColumns.includes(column)),
  )

  let update = supabase
    .from(table)
    .update(patch)
    .match(match)
    .lt('updated_at', row.updated_at)
    .select(columns)
  for (const [name, value] of Object.entries(headers)) update = update.setHeader(name, value)
  const { data: updated, error: updateError } = await update
  if (updateError) throw updateError
  if (updated?.[0]) return updated[0] as unknown as SyncRow

  let insert = supabase
    .from(table)
    .upsert(row, { onConflict: conflictColumns.join(','), ignoreDuplicates: true })
    .select(columns)
  for (const [name, value] of Object.entries(headers)) insert = insert.setHeader(name, value)
  const { data: inserted, error: insertError } = await insert
  if (insertError) throw insertError
  if (inserted?.[0]) return inserted[0] as unknown as SyncRow

  const { data: kept, error: readError } = await supabase
    .from(table)
    .select(columns)
    .match(match)
    .maybeSingle()
  if (readError) throw readError
  return (kept as unknown as SyncRow | null) ?? null
}
