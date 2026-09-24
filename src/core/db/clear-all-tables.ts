import type { DbClient } from './db-client'
import { migrations } from './migrations'

const CREATE_TABLE = /CREATE TABLE IF NOT EXISTS (\w+)/g

/**
 * Tables créées par les migrations, dans l'ordre de leur première création : une nouvelle
 * migration s'y ajoute toute seule, une table reconstruite n'y figure qu'une fois.
 */
export function migrationTableNames(): string[] {
  const names = migrations.flatMap((migration) =>
    migration.statements.flatMap((statement) =>
      [...statement.matchAll(CREATE_TABLE)].map((match) => match[1] as string),
    ),
  )
  return [...new Set(names)]
}

/**
 * Outil de développement, pas une suppression logique : efface physiquement
 * toutes les lignes, `deleted_at` renseigné ou non, en un seul lot.
 * Les tables enfants passent avant leurs parents pour respecter les clés étrangères.
 */
export async function clearAllTables(db: DbClient): Promise<void> {
  const tables = migrationTableNames().reverse()
  await db.runMany(tables.map((table) => ({ sql: `DELETE FROM ${table}` })))
}
