// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  addUpgradeStatement: vi.fn<() => Promise<void>>(),
  createConnection: vi.fn<() => Promise<{ open: () => Promise<void> }>>(),
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    addUpgradeStatement = plugin.addUpgradeStatement
    createConnection = plugin.createConnection
  },
}))

// Seul `open()` est appelé par `openDatabase()`.
function fakeConnection() {
  return { open: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
}

// Recharger le module est le seul moyen de repartir d'un cache de connexion vide.
async function importSqlite() {
  vi.resetModules()
  return import('../sqlite')
}

describe('getDb', () => {
  beforeEach(() => {
    plugin.addUpgradeStatement.mockReset().mockResolvedValue(undefined)
    plugin.createConnection.mockReset()
  })

  it("n'ouvre la base qu'une fois et partage le même client", async () => {
    plugin.createConnection.mockResolvedValue(fakeConnection())
    const { getDb } = await importSqlite()

    const [first, second] = await Promise.all([getDb(), getDb()])

    expect(first).toBe(second)
    expect(plugin.createConnection).toHaveBeenCalledTimes(1)
  })

  it('ne met pas en cache une ouverture échouée et réessaie à l’appel suivant', async () => {
    plugin.createConnection
      .mockRejectedValueOnce(new Error('base indisponible'))
      .mockResolvedValueOnce(fakeConnection())
    const { getDb } = await importSqlite()

    await expect(getDb()).rejects.toThrow('base indisponible')
    await expect(getDb()).resolves.toBeDefined()
    expect(plugin.createConnection).toHaveBeenCalledTimes(2)
  })
})

describe('runMany', () => {
  function connectionWithExecuteSet() {
    return {
      open: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      executeSet: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
  }

  beforeEach(() => {
    plugin.addUpgradeStatement.mockReset().mockResolvedValue(undefined)
    plugin.createConnection.mockReset()
  })

  it('passe le lot à `executeSet`, qui le pose dans une seule transaction', async () => {
    const connection = connectionWithExecuteSet()
    plugin.createConnection.mockResolvedValue(connection)
    const { getDb } = await importSqlite()

    const db = await getDb()
    await db.runMany([
      { sql: 'UPDATE animal SET deleted_at = ? WHERE id = ?', params: ['maintenant', 'a-1'] },
      { sql: 'DELETE FROM vaccination' },
    ])

    expect(connection.executeSet).toHaveBeenCalledWith([
      {
        statement: 'UPDATE animal SET deleted_at = ? WHERE id = ?',
        values: ['maintenant', 'a-1'],
      },
      { statement: 'DELETE FROM vaccination', values: [] },
    ])
  })

  it('ne touche pas au plugin pour un lot vide', async () => {
    const connection = connectionWithExecuteSet()
    plugin.createConnection.mockResolvedValue(connection)
    const { getDb } = await importSqlite()

    const db = await getDb()
    await expect(db.runMany([])).resolves.toBeUndefined()

    expect(connection.executeSet).not.toHaveBeenCalled()
  })
})
