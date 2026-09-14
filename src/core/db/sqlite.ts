import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import type { DbClient, SqlParam } from './db-client'
import { DATABASE_VERSION, migrations } from './migrations'
import { prepareWebSqlite } from './web-sqlite'

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
  await prepareWebSqlite()
  await sqlite.addUpgradeStatement(DATABASE_NAME, migrations)
  const connection = await connect()
  await connection.open()
  await connection.execute('PRAGMA foreign_keys = ON;')
  return toDbClient(connection)
}

/**
 * La connexion native survit à un rechargement de la WebView (live reload, WebView
 * relancée par le système) alors que le côté JS repart à vide : `createConnection`
 * serait refusé. La vérification de cohérence ferme les connexions natives orphelines.
 */
async function connect(): Promise<SQLiteDBConnection> {
  const isConsistent = (await sqlite.checkConnectionsConsistency()).result === true
  const isKnown = (await sqlite.isConnection(DATABASE_NAME, false)).result === true
  if (isConsistent && isKnown) return sqlite.retrieveConnection(DATABASE_NAME, false)
  return sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', DATABASE_VERSION, false)
}

function toDbClient(connection: SQLiteDBConnection): DbClient {
  return {
    async run(sql, params = []) {
      const result = await connection.run(sql, params)
      return result.changes?.changes ?? 0
    },
    async runMany(statements) {
      if (statements.length === 0) return
      await connection.executeSet(
        statements.map(({ sql, params = [] }) => ({ statement: sql, values: params })),
      )
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
