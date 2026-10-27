import type { SqlStatement } from '@/core/db/db-client'
import type { SyncRow, SyncRowValue } from '@/core/supabase/guarded-upsert'

export type { SyncRow, SyncRowValue }

/** `noUncheckedIndexedAccess` ajoute `| undefined` sur une colonne non déclarée : ramenée à `null`. */
export function syncField(row: SyncRow, column: string): SyncRowValue {
  return row[column] ?? null
}

/** Un envoi : l'heure du téléphone quand il commence, dont le serveur tire un seul écart d'horloge. */
export interface SyncPush {
  id: string
  sentAt: string
}

export interface SyncPullPage {
  rows: SyncRow[]
  /** `server_updated_at` de chaque ligne, dans l'ordre de `rows`. */
  stamps: string[]
  /** `server_updated_at` de la dernière ligne de la page, ou `null` si elle est vide. */
  cursor: string | null
}

/** Ce que le serveur garde pour un compte, lu sans rien télécharger du carnet. */
export interface RemoteBackupReads {
  countRemoteRows(userId: string, options?: { aliveOnly?: boolean }): Promise<number>
  /** `server_updated_at` le plus récent du compte dans la table, ou `null` sans ligne. */
  latestRemoteStamp(userId: string): Promise<string | null>
}

/** Port implémenté par le repository propriétaire de chaque table synchronisable. */
export interface SyncableTable {
  readonly entity: string
  /** Ligne courante, tombstones compris : pas de filtre `deleted_at IS NULL`. */
  getRowForPush(id: string): Promise<SyncRow | null>
  /** Rend la ligne telle que le serveur l'a gardée ; sans envoi, le serveur écrête ligne par ligne. */
  pushRow(userId: string, row: SyncRow, push?: SyncPush): Promise<SyncRow | null>
  /**
   * Lignes dans l'ordre `(server_updated_at, id)`, à partir de `since` ; avec `afterId`, celles de
   * l'instant `since` ne reprennent qu'après cet identifiant.
   */
  pullPage(userId: string, since: string, limit: number, afterId?: string): Promise<SyncPullPage>
  /** Fournie sans être exécutée : le cycle la joue avec les autres dans un même `runMany`. */
  applyRemoteRowStatement(row: SyncRow): SqlStatement
  /** Sans la garde « la plus récente gagne », tant que la ligne locale est celle qui a été envoyée. */
  replacePushedRowStatement(row: SyncRow, sentUpdatedAt: string): SqlStatement
}
