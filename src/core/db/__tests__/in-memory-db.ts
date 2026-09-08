import { createRequire } from 'node:module'
import initSqlJs, { type Database } from 'sql.js'
import type { DbClient, SqlParam } from '../db-client'
import { migrations } from '../migrations'

const require = createRequire(import.meta.url)

export interface InMemoryDb extends DbClient {
  close(): void
}

/** Vrai moteur SQL (sql.js, en mémoire), sans Capacitor ni appareil Android. */
export async function createSqlJsDbClient(): Promise<InMemoryDb> {
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) })
  return toDbClient(new SQL.Database())
}

/** Base en mémoire avec toutes les migrations déjà appliquées. */
export async function createInMemoryDb(): Promise<InMemoryDb> {
  const db = await createSqlJsDbClient()
  await applyMigrations(db)
  return db
}

/** Reproduit `addUpgradeStatement`, injouable hors appareil : deux appels ne rejouent rien. */
export async function applyMigrations(db: DbClient): Promise<void> {
  const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = version?.user_version ?? 0

  for (const migration of migrations) {
    if (migration.toVersion <= currentVersion) continue
    for (const statement of migration.statements) {
      await db.execute(statement)
    }
    await db.execute(`PRAGMA user_version = ${migration.toVersion}`)
  }
}

function toDbClient(database: Database): InMemoryDb {
  return {
    async run(sql, params = []) {
      database.run(sql, params)
      return database.getRowsModified()
    },
    async runMany(statements) {
      if (statements.length === 0) return
      database.exec('BEGIN')
      try {
        for (const { sql, params = [] } of statements) {
          database.run(sql, params)
        }
        database.exec('COMMIT')
      } catch (error) {
        rollback(database, error)
        throw error
      }
    },
    async query<T>(sql: string, params: SqlParam[] = []) {
      const statement = database.prepare(sql)
      try {
        statement.bind(params)
        const rows: T[] = []
        while (statement.step()) {
          rows.push(statement.getAsObject() as T)
        }
        return rows
      } finally {
        statement.free()
      }
    },
    async execute(sql) {
      database.exec(sql)
    },
    close() {
      database.close()
    },
  }
}

/** Un rollback raté laisse peut-être une transaction ouverte : plus grave que l'échec d'origine. */
function rollback(database: Database, cause: unknown): void {
  try {
    database.exec('ROLLBACK')
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error), { cause })
  }
}
