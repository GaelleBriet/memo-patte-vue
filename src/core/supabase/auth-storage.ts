import type { SupportedStorage } from '@supabase/supabase-js'

import { errorSummary } from '@/shared/utils/error-summary'

import { currentSessionVault, type SessionVault } from './session-vault'

export type { SessionVault } from './session-vault'

export const AUTH_STORAGE_KEY = 'memopatte.auth.session'

const PKCE_FLOWS_INDEX = `${AUTH_STORAGE_KEY}-flows-code-verifier`

function removeLegacy(legacy: Storage | undefined, key: string): void {
  try {
    legacy?.removeItem(key)
  } catch (cause) {
    console.warn('Session non effacée du stockage en clair :', errorSummary(cause))
  }
}

async function migrateLegacy(
  vault: SessionVault,
  legacy: Storage,
  key: string,
): Promise<string | null> {
  let plain: string | null
  try {
    plain = legacy.getItem(key)
  } catch {
    return null
  }
  if (plain === null) return null
  try {
    await vault.set(key, plain)
    return plain
  } catch (cause) {
    console.warn('Session non migrée vers le stockage sécurisé :', errorSummary(cause))
    return null
  } finally {
    removeLegacy(legacy, key)
  }
}

const unreadableListeners: (() => void)[] = []

export function onSessionUnreadable(listener: () => void): void {
  unreadableListeners.push(listener)
}

function signalUnreadableSession(): void {
  for (const listener of unreadableListeners) listener()
}

export function createAuthStorage(vault: SessionVault, legacy?: Storage): SupportedStorage {
  return {
    async getItem(key) {
      try {
        const stored = await vault.get(key)
        if (stored !== null) {
          removeLegacy(legacy, key)
          return stored
        }
        if (!legacy) return null
      } catch (cause) {
        console.warn('Session illisible dans le stockage sécurisé :', errorSummary(cause))
        removeLegacy(legacy, key)
        signalUnreadableSession()
        return null
      }
      return migrateLegacy(vault, legacy, key)
    },
    async setItem(key, value) {
      try {
        await vault.set(key, value)
      } catch (cause) {
        console.warn('Session non enregistrée dans le stockage sécurisé :', errorSummary(cause))
      }
    },
    async removeItem(key) {
      try {
        await vault.remove(key)
      } catch (cause) {
        console.warn('Session non effacée du stockage sécurisé :', errorSummary(cause))
      }
    },
  }
}

export const authStorage: SupportedStorage = {
  getItem: (key) => {
    const { vault, legacy } = currentSessionVault()
    return createAuthStorage(vault, legacy).getItem(key)
  },
  setItem: (key, value) => {
    const { vault, legacy } = currentSessionVault()
    return createAuthStorage(vault, legacy).setItem(key, value)
  },
  removeItem: (key) => {
    const { vault, legacy } = currentSessionVault()
    return createAuthStorage(vault, legacy).removeItem(key)
  },
}

async function pendingPkceFlowIds(vault: SessionVault, legacy?: Storage): Promise<string[]> {
  const ids = new Set<string>()
  const sources: (() => Promise<string | null> | string | null | undefined)[] = [
    () => vault.get(PKCE_FLOWS_INDEX),
    () => legacy?.getItem(PKCE_FLOWS_INDEX),
  ]
  for (const read of sources) {
    try {
      const index: unknown = JSON.parse((await read()) ?? '[]')
      if (Array.isArray(index)) {
        for (const id of index) if (typeof id === 'string') ids.add(id)
      }
    } catch {
      continue
    }
  }
  return [...ids]
}

export async function forgetSession(vault: SessionVault, legacy?: Storage): Promise<void> {
  const flowIds = await pendingPkceFlowIds(vault, legacy)
  const keys = [
    ...flowIds.map((id) => `${AUTH_STORAGE_KEY}-flow-${id}-code-verifier`),
    PKCE_FLOWS_INDEX,
    `${AUTH_STORAGE_KEY}-code-verifier`,
    `${AUTH_STORAGE_KEY}-user`,
    AUTH_STORAGE_KEY,
  ]
  for (const key of keys) {
    try {
      await vault.remove(key)
    } catch (cause) {
      console.warn('Session non effacée de l’appareil :', errorSummary(cause))
    }
    removeLegacy(legacy, key)
  }
}

export function forgetStoredSession(): Promise<void> {
  const { vault, legacy } = currentSessionVault()
  return forgetSession(vault, legacy)
}
