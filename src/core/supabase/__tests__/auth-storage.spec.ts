import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AUTH_STORAGE_KEY,
  createAuthStorage,
  forgetSession,
  type SessionVault,
} from '../auth-storage'

type FakeVault = SessionVault & { items: Map<string, string> }

function fakeVault(): FakeVault {
  const items = new Map<string, string>()
  return {
    items,
    get: async (key) => items.get(key) ?? null,
    set: async (key, value) => void items.set(key, value),
    remove: async (key) => void items.delete(key),
  }
}

function fakeLegacy(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    key: (index) => [...items.keys()][index] ?? null,
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

const SESSION = JSON.stringify({ access_token: 'jeton', user: { email: 'sophie@exemple.fr' } })

let vault: FakeVault
let legacy: Storage

beforeEach(() => {
  vault = fakeVault()
  legacy = fakeLegacy()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('stockage de la session', () => {
  it('écrit et relit dans le coffre, jamais dans le stockage en clair', async () => {
    const storage = createAuthStorage(vault, legacy)

    await storage.setItem(AUTH_STORAGE_KEY, SESSION)

    expect(await storage.getItem(AUTH_STORAGE_KEY)).toBe(SESSION)
    expect(legacy.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('retire une clé du coffre', async () => {
    const storage = createAuthStorage(vault, legacy)
    await storage.setItem(AUTH_STORAGE_KEY, SESSION)

    await storage.removeItem(AUTH_STORAGE_KEY)

    expect(await storage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  describe('mise à niveau depuis une session en clair', () => {
    it('recopie la session dans le coffre puis l’efface du stockage en clair', async () => {
      legacy.setItem(AUTH_STORAGE_KEY, SESSION)
      const storage = createAuthStorage(vault, legacy)

      expect(await storage.getItem(AUTH_STORAGE_KEY)).toBe(SESSION)

      expect(vault.items.get(AUTH_STORAGE_KEY)).toBe(SESSION)
      expect(legacy.getItem(AUTH_STORAGE_KEY)).toBeNull()
    })

    it('migre aussi les clés PKCE en attente', async () => {
      const key = `${AUTH_STORAGE_KEY}-flow-a-code-verifier`
      legacy.setItem(key, 'verifier')
      const storage = createAuthStorage(vault, legacy)

      expect(await storage.getItem(key)).toBe('verifier')
      expect(legacy.getItem(key)).toBeNull()
    })

    it('préfère le coffre à une copie en clair restée derrière', async () => {
      vault.items.set(AUTH_STORAGE_KEY, 'récent')
      legacy.setItem(AUTH_STORAGE_KEY, 'ancien')
      const storage = createAuthStorage(vault, legacy)

      expect(await storage.getItem(AUTH_STORAGE_KEY)).toBe('récent')
    })

    it('efface la copie en clair restée derrière quand le coffre a déjà la valeur', async () => {
      vault.items.set(AUTH_STORAGE_KEY, 'récent')
      legacy.setItem(AUTH_STORAGE_KEY, 'ancien')
      const storage = createAuthStorage(vault, legacy)

      await storage.getItem(AUTH_STORAGE_KEY)

      expect(legacy.length).toBe(0)
    })

    it('efface la copie en clair même si le coffre refuse l’écriture : déconnecté', async () => {
      legacy.setItem(AUTH_STORAGE_KEY, SESSION)
      vault.set = async () => {
        throw new Error('keystore indisponible')
      }
      const storage = createAuthStorage(vault, legacy)

      expect(await storage.getItem(AUTH_STORAGE_KEY)).toBeNull()
      expect(legacy.getItem(AUTH_STORAGE_KEY)).toBeNull()
    })
  })

  describe('échec du Keystore', () => {
    it('lecture impossible : déconnecté, sans repli sur le stockage en clair', async () => {
      legacy.setItem(AUTH_STORAGE_KEY, SESSION)
      vault.get = async () => {
        throw new Error('keystore indisponible')
      }
      const storage = createAuthStorage(vault, legacy)

      expect(await storage.getItem(AUTH_STORAGE_KEY)).toBeNull()
      expect(legacy.getItem(AUTH_STORAGE_KEY)).toBe(SESSION)
    })

    it('écriture impossible : rien n’est écrit en clair et l’appel ne lève pas', async () => {
      vault.set = async () => {
        throw new Error('keystore indisponible')
      }
      const storage = createAuthStorage(vault, legacy)

      await expect(storage.setItem(AUTH_STORAGE_KEY, SESSION)).resolves.toBeUndefined()

      expect(legacy.getItem(AUTH_STORAGE_KEY)).toBeNull()
    })

    it('effacement impossible : ne lève pas', async () => {
      vault.remove = async () => {
        throw new Error('keystore indisponible')
      }
      const storage = createAuthStorage(vault, legacy)

      await expect(storage.removeItem(AUTH_STORAGE_KEY)).resolves.toBeUndefined()
    })

    it('ne journalise ni le jeton ni l’e-mail', async () => {
      vault.set = async () => {
        throw new Error(`échec pour ${SESSION}`)
      }
      const storage = createAuthStorage(vault, legacy)

      await storage.setItem(AUTH_STORAGE_KEY, SESSION)

      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('sophie@exemple.fr')
    })
  })
})

describe('oubli de la session', () => {
  it('efface la session, l’utilisateur et tous les vérifieurs PKCE du coffre et du clair', async () => {
    const flowKey = `${AUTH_STORAGE_KEY}-flow-a-code-verifier`
    const index = `${AUTH_STORAGE_KEY}-flows-code-verifier`
    for (const store of [vault.items, legacy]) {
      const put = (key: string, value: string) =>
        store instanceof Map ? store.set(key, value) : store.setItem(key, value)
      put(AUTH_STORAGE_KEY, SESSION)
      put(`${AUTH_STORAGE_KEY}-user`, '{}')
      put(`${AUTH_STORAGE_KEY}-code-verifier`, 'ancien')
      put(index, JSON.stringify(['a']))
      put(flowKey, 'verifier')
    }

    await forgetSession(vault, legacy)

    expect([...vault.items.keys()]).toEqual([])
    expect(legacy.length).toBe(0)
  })

  it('ne lève pas quand le coffre refuse l’effacement et continue les autres clés', async () => {
    legacy.setItem(AUTH_STORAGE_KEY, SESSION)
    vault.remove = async () => {
      throw new Error('keystore indisponible')
    }

    await expect(forgetSession(vault, legacy)).resolves.toBeUndefined()

    expect(legacy.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('ne lève pas quand le stockage en clair refuse l’effacement', async () => {
    legacy.removeItem = () => {
      throw new DOMException('bloqué', 'SecurityError')
    }

    await expect(forgetSession(vault, legacy)).resolves.toBeUndefined()
  })
})
