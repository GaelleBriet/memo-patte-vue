// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  initWebStore: vi.fn<() => Promise<void>>(),
  addUpgradeStatement: vi.fn<() => Promise<void>>(),
  createConnection:
    vi.fn<() => Promise<{ open: () => Promise<void>; execute: () => Promise<void> }>>(),
  checkConnectionsConsistency: vi.fn<() => Promise<{ result?: boolean }>>(),
  isConnection: vi.fn<() => Promise<{ result?: boolean }>>(),
  retrieveConnection:
    vi.fn<() => Promise<{ open: () => Promise<void>; execute: () => Promise<void> }>>(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: { initWebStore: plugin.initWebStore },
  SQLiteConnection: class {
    addUpgradeStatement = plugin.addUpgradeStatement
    createConnection = plugin.createConnection
    checkConnectionsConsistency = plugin.checkConnectionsConsistency
    isConnection = plugin.isConnection
    retrieveConnection = plugin.retrieveConnection
  },
}))

function resetPlugin() {
  plugin.initWebStore.mockReset()
  plugin.addUpgradeStatement.mockReset().mockResolvedValue(undefined)
  plugin.createConnection.mockReset()
  // Par défaut : aucune connexion connue, ni côté JS ni côté natif.
  plugin.checkConnectionsConsistency.mockReset().mockResolvedValue({ result: false })
  plugin.isConnection.mockReset().mockResolvedValue({ result: false })
  plugin.retrieveConnection.mockReset()
}

function fakeConnection() {
  return {
    open: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    execute: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
}

// Recharger le module est le seul moyen de repartir d'un cache de connexion vide.
async function importSqlite() {
  vi.resetModules()
  return import('../sqlite')
}

describe('getDb', () => {
  beforeEach(resetPlugin)

  it('vérifie la cohérence JS / natif avant de créer la connexion', async () => {
    plugin.createConnection.mockResolvedValue(fakeConnection())
    const { getDb } = await importSqlite()

    await getDb()

    // Après un rechargement de la WebView, la connexion native survit : la
    // vérification de cohérence la ferme pour que la création ne soit pas refusée.
    expect(plugin.checkConnectionsConsistency).toHaveBeenCalled()
    expect(plugin.checkConnectionsConsistency.mock.invocationCallOrder[0]).toBeLessThan(
      plugin.createConnection.mock.invocationCallOrder[0]!,
    )
  })

  it('réutilise la connexion quand JS et natif la connaissent tous les deux', async () => {
    const connection = fakeConnection()
    plugin.checkConnectionsConsistency.mockResolvedValue({ result: true })
    plugin.isConnection.mockResolvedValue({ result: true })
    plugin.retrieveConnection.mockResolvedValue(connection)
    const { getDb } = await importSqlite()

    await expect(getDb()).resolves.toBeDefined()

    expect(plugin.createConnection).not.toHaveBeenCalled()
    expect(connection.open).toHaveBeenCalled()
  })

  it("sur Android, n'ouvre jamais le store web", async () => {
    plugin.createConnection.mockResolvedValue(fakeConnection())
    const { getDb } = await importSqlite()

    await getDb()

    expect(plugin.initWebStore).not.toHaveBeenCalled()
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
      ...fakeConnection(),
      executeSet: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
  }

  beforeEach(resetPlugin)

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
