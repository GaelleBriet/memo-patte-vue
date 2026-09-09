import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ current: 'android' }))

const loader = vi.hoisted(() => ({
  defineCustomElements: vi.fn<(win: Window) => Promise<void>>(),
}))

const plugin = vi.hoisted(() => ({
  initWebStore: vi.fn<() => Promise<void>>(),
  addUpgradeStatement: vi.fn<() => Promise<void>>(),
  createConnection: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform.current },
}))

vi.mock('jeep-sqlite/loader', () => ({
  defineCustomElements: loader.defineCustomElements,
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: { initWebStore: plugin.initWebStore },
  SQLiteConnection: class {
    addUpgradeStatement = plugin.addUpgradeStatement
    createConnection = plugin.createConnection
  },
}))

// Le registre de jsdom est partagé par tout le fichier et rien ne s'y « dé-définit » :
// un faux registre par test garde la sémantique de `whenDefined` (attente sans fin).
function fakeCustomElementRegistry() {
  const defined = new Set<string>()
  const resolvers = new Map<string, () => void>()
  const waiting = new Map<string, Promise<void>>()
  return {
    get: (tag: string) => (defined.has(tag) ? HTMLElement : undefined),
    whenDefined(tag: string) {
      if (!waiting.has(tag)) {
        waiting.set(
          tag,
          new Promise<void>((resolve) => {
            if (defined.has(tag)) resolve()
            else resolvers.set(tag, resolve)
          }),
        )
      }
      return waiting.get(tag)
    },
    define(tag: string) {
      defined.add(tag)
      resolvers.get(tag)?.()
    },
  }
}

// Copie du vrai `initWebStore` du plugin : c'est cette attente qui ne rend jamais la main.
function initWebStoreLikeThePlugin() {
  return customElements.whenDefined('jeep-sqlite').then(() => undefined)
}

function registerJeepSqlite() {
  customElements.define('jeep-sqlite', class extends HTMLElement {})
}

function withinDelay<T>(promise: Promise<T>, ms = 200): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`toujours en attente après ${ms} ms`)), ms),
    ),
  ])
}

async function importFresh() {
  vi.resetModules()
  const [webSqlite, sqlite] = await Promise.all([import('../web-sqlite'), import('../sqlite')])
  return { ...webSqlite, ...sqlite }
}

function fakeConnection() {
  return {
    open: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    execute: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.stubGlobal('customElements', fakeCustomElementRegistry())
  platform.current = 'android'
  loader.defineCustomElements.mockReset().mockResolvedValue(undefined)
  plugin.initWebStore.mockReset().mockImplementation(initWebStoreLikeThePlugin)
  plugin.addUpgradeStatement.mockReset().mockResolvedValue(undefined)
  plugin.createConnection.mockReset().mockResolvedValue(fakeConnection())
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('prepareWebSqlite', () => {
  it('ne fait rien hors du web : ni chargeur, ni élément, ni store', async () => {
    const { prepareWebSqlite } = await importFresh()

    await prepareWebSqlite()

    expect(loader.defineCustomElements).not.toHaveBeenCalled()
    expect(document.querySelector('jeep-sqlite')).toBeNull()
    expect(plugin.initWebStore).not.toHaveBeenCalled()
  })

  it("sur le web, enregistre l'élément, l'ajoute au body avec autoSave, puis ouvre le store", async () => {
    platform.current = 'web'
    loader.defineCustomElements.mockImplementation(async () => registerJeepSqlite())
    const { prepareWebSqlite } = await importFresh()

    await withinDelay(prepareWebSqlite())

    expect(loader.defineCustomElements).toHaveBeenCalledWith(window)
    const element = document.body.querySelector('jeep-sqlite') as HTMLElement & {
      autoSave?: boolean
    }
    expect(element).not.toBeNull()
    expect(element.autoSave).toBe(true)
    expect(plugin.initWebStore).toHaveBeenCalledTimes(1)
  })

  it("n'ajoute qu'un seul élément quand elle est appelée deux fois", async () => {
    platform.current = 'web'
    loader.defineCustomElements.mockImplementation(async () => registerJeepSqlite())
    const { prepareWebSqlite } = await importFresh()

    await withinDelay(prepareWebSqlite())
    await withinDelay(prepareWebSqlite())

    expect(document.querySelectorAll('jeep-sqlite')).toHaveLength(1)
  })

  it("rejette explicitement, sans attendre, si le chargeur n'a pas enregistré jeep-sqlite", async () => {
    platform.current = 'web'
    const { prepareWebSqlite } = await importFresh()

    await expect(withinDelay(prepareWebSqlite())).rejects.toThrow(
      'SQLite web indisponible : jeep-sqlite non chargé',
    )
    expect(plugin.initWebStore).not.toHaveBeenCalled()
  })
})

describe('getDb sur le web', () => {
  it('prépare jeep-sqlite avant de créer la connexion', async () => {
    platform.current = 'web'
    const order: string[] = []
    loader.defineCustomElements.mockImplementation(async () => registerJeepSqlite())
    plugin.initWebStore.mockImplementation(async () => {
      await initWebStoreLikeThePlugin()
      order.push('initWebStore')
    })
    plugin.createConnection.mockImplementation(async () => {
      order.push('createConnection')
      return fakeConnection()
    })
    const { getDb } = await importFresh()

    await withinDelay(getDb())

    expect(order).toEqual(['initWebStore', 'createConnection'])
  })

  it('rejette sans jeep-sqlite au lieu de bloquer, et ne touche pas au plugin', async () => {
    platform.current = 'web'
    const { getDb } = await importFresh()

    await expect(withinDelay(getDb())).rejects.toThrow('jeep-sqlite non chargé')
    expect(plugin.createConnection).not.toHaveBeenCalled()
  })
})
