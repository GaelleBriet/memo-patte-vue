import type { SqlStatement } from '@/core/db/db-client'
import type { SyncRow, SyncRowValue } from '@/core/supabase/guarded-upsert'

export type { SyncRow, SyncRowValue }

/** `noUncheckedIndexedAccess` ajoute `| undefined` sur une colonne non déclarée : ramenée à `null`. */
export function syncField(row: SyncRow, column: string): SyncRowValue {
  return row[column] ?? null
}

export interface SyncPullPage {
  rows: SyncRow[]
  /** `server_updated_at` de la dernière ligne de la page, ou `null` si elle est vide. */
  cursor: string | null
}

/**
 * Port implémenté par le repository propriétaire de chaque table synchronisable : lui seul écrit le
 * SQL, local ou Supabase, `core/sync` ne fait qu'orchestrer ces méthodes (cf. CLAUDE.md).
 */
export interface SyncableTable {
  readonly entity: string
  /** Ligne courante, tombstones compris : pas de filtre `deleted_at IS NULL`. */
  getRowForPush(id: string): Promise<SyncRow | null>
  pushRow(userId: string, row: SyncRow): Promise<void>
  pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage>
  /** Fournie sans être exécutée : le cycle la joue avec les autres dans un même `runMany`. */
  applyRemoteRowStatement(row: SyncRow): SqlStatement
}
