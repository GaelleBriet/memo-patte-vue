import type { SqlStatement } from '@/core/db/db-client'
import { syncField, type SyncRow } from '../service/syncable-table'

export interface PushedRowReplacementOptions {
  table: string
  columns: string
}

export function createPushedRowReplacement({ table, columns }: PushedRowReplacementOptions) {
  const replaced = columns
    .split(',')
    .map((column) => column.trim())
    .filter((column) => column !== 'id')

  return {
    replacePushedRowStatement(row: SyncRow, sentUpdatedAt: string): SqlStatement {
      return {
        sql: `UPDATE ${table} SET ${replaced.map((column) => `${column} = ?`).join(', ')}
              WHERE id = ? AND updated_at = ?`,
        params: [...replaced.map((column) => syncField(row, column)), row.id, sentUpdatedAt],
      }
    },
  }
}
