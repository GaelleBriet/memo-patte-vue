import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

export type SessionVault = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

const KEYSTORE_PREFIX = 'memopatte_'

let prefixReady: Promise<void> | null = null

function keystorePrefix(): Promise<void> {
  prefixReady ??= SecureStorage.setKeyPrefix(KEYSTORE_PREFIX).catch((cause: unknown) => {
    prefixReady = null
    throw cause
  })
  return prefixReady
}

const keystoreVault: SessionVault = {
  async get(key) {
    await keystorePrefix()
    return SecureStorage.getItem(key)
  },
  async set(key, value) {
    await keystorePrefix()
    await SecureStorage.setItem(key, value)
  },
  async remove(key) {
    await keystorePrefix()
    await SecureStorage.removeItem(key)
  },
}

const browserVault: SessionVault = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => localStorage.setItem(key, value),
  remove: async (key) => localStorage.removeItem(key),
}

export function currentSessionVault(): { vault: SessionVault; legacy: Storage | undefined } {
  return Capacitor.isNativePlatform()
    ? { vault: keystoreVault, legacy: localStorage }
    : { vault: browserVault, legacy: undefined }
}
