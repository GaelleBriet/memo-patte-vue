// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlParam } from '../db-client'
import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'

const plugin = vi.hoisted(() => ({
  addUpgradeStatement: vi.fn<() => Promise<void>>(),
  createConnection: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    addUpgradeStatement = plugin.addUpgradeStatement
    createConnection = plugin.createConnection
    // Aucune connexion native héritée d'un rechargement de la WebView.
    checkConnectionsConsistency = () => Promise.resolve({ result: false })
    isConnection = () => Promise.resolve({ result: false })
  },
}))

// Le plugin joue les migrations dans `open()` ; sql.js, lui, laisse `foreign_keys` à OFF,
// donc seul le PRAGMA d'`openDatabase()` peut faire échouer l'insertion orpheline.
function sqlJsConnection(engine: InMemoryDb) {
  return {
    open: () => applyMigrations(engine),
    isDBOpen: () => Promise.resolve({ result: false }),
    execute: (sql: string) => engine.execute(sql),
    run: async (sql: string, values: SqlParam[]) => ({
      changes: { changes: await engine.run(sql, values) },
    }),
    query: async (sql: string, values: SqlParam[]) => ({ values: await engine.query(sql, values) }),
  }
}

describe('base ouverte par getDb', () => {
  let engine: InMemoryDb

  beforeEach(async () => {
    engine = await createSqlJsDbClient()
    plugin.addUpgradeStatement.mockReset().mockResolvedValue(undefined)
    plugin.createConnection.mockReset().mockResolvedValue(sqlJsConnection(engine))
    vi.resetModules()
  })

  afterEach(() => {
    engine.close()
  })

  it('refuse un vaccin rattaché à un animal inexistant', async () => {
    const { getDb } = await import('../sqlite')

    const db = await getDb()

    await expect(
      db.run(
        `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['v1', 'inconnu', 'CHPPi', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})
