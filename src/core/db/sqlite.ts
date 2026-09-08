import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import type { DbClient, SqlParam } from './db-client'
import { DATABASE_VERSION, migrations } from './migrations'

export const DATABASE_NAME = 'memopatte'

const sqlite = new SQLiteConnection(CapacitorSQLite)

let connecting: Promise<DbClient> | null = null

/** Ouverture ratée non mise en cache : l'appel suivant doit pouvoir réessayer. */
export function getDb(): Promise<DbClient> {
  connecting ??= openDatabase().catch((error: unknown) => {
    connecting = null
    throw error
  })
  return connecting
}

async function openDatabase(): Promise<DbClient> {
  await sqlite.addUpgradeStatement(DATABASE_NAME, migrations)
  const connection = await sqlite.createConnection(
    DATABASE_NAME,
    false,
    'no-encryption',
    DATABASE_VERSION,
    false,
  )
  await connection.open()
  return toDbClient(connection)
}

function toDbClient(connection: SQLiteDBConnection): DbClient {
  return {
    async run(sql, params = []) {
      const result = await connection.run(sql, params)
      return result.changes?.changes ?? 0
    },
    async query<T>(sql: string, params: SqlParam[] = []) {
      const result = await connection.query(sql, params)
      return (result.values ?? []) as T[]
    },
    async execute(sql) {
      await connection.execute(sql)
    },
  }
}
