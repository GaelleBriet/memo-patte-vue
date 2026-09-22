import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncRowValue = string | number | null

export interface SyncRow extends Record<string, SyncRowValue> {
  id: string
  updated_at: string
}

/**
 * PostgREST ne sait pas exprimer `on conflict … do update … where excluded.updated_at > table.updated_at`
 * en une seule requête : la garde s'obtient par deux écritures, chacune atomique côté Postgres — une
 * mise à jour conditionnée par `updated_at`, puis une création qui ne fait rien si la ligne existe déjà.
 */
export async function guardedUpsert(
  supabase: SupabaseClient,
  table: string,
  conflictColumns: string[],
  row: SyncRow,
): Promise<void> {
  const match: Record<string, SyncRowValue> = Object.fromEntries(
    conflictColumns.map((column) => [column, row[column] ?? null]),
  )
  const patch = Object.fromEntries(
    Object.entries(row).filter(([column]) => !conflictColumns.includes(column)),
  )

  const { data: updated, error: updateError } = await supabase
    .from(table)
    .update(patch)
    .match(match)
    .lt('updated_at', row.updated_at)
    .select('id')
  if (updateError) throw updateError
  if ((updated?.length ?? 0) > 0) return

  const { error: insertError } = await supabase
    .from(table)
    .upsert(row, { onConflict: conflictColumns.join(','), ignoreDuplicates: true })
  if (insertError) throw insertError
}
