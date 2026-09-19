// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANALYTICS_CONSENT_KEY } from '@/core/analytics/analytics'
import {
  markPlusNudgeShown,
  readPlusNudgeState,
  PLUS_NUDGE_STORAGE_KEY,
} from '@/features/purchase/plus-nudge'
import { PLUS_STATUS_STORAGE_KEY } from '@/features/purchase/plus-status-storage'
import { readUsageSignals, USAGE_SIGNALS_STORAGE_KEY } from '@/shared/utils/usage-signals'

import {
  clearDeviceAccountState,
  clearSignedOutAccountState,
} from '../device-account-state.service'
import { memoryStorage, type MemoryStorage } from './auth-fixture'

const UNRELATED_KEYS = [ANALYTICS_CONSENT_KEY, 'memopatte.notifications.primingAnswered']

let storage: MemoryStorage

function writeDeviceState(): void {
  storage.setItem(PLUS_STATUS_STORAGE_KEY, '{"plan":"annual","expiresAt":null}')
  storage.setItem(USAGE_SIGNALS_STORAGE_KEY, '{"photo":{"count":3,"lastAt":null}}')
  storage.setItem(PLUS_NUDGE_STORAGE_KEY, '{"stopped":true}')
  for (const key of UNRELATED_KEYS) storage.setItem(key, 'peu importe')
}

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('clearSignedOutAccountState', () => {
  it('n’efface que les compteurs d’usage', () => {
    writeDeviceState()

    clearSignedOutAccountState()

    expect(storage.keys().sort()).toEqual(
      [PLUS_STATUS_STORAGE_KEY, PLUS_NUDGE_STORAGE_KEY, ...UNRELATED_KEYS].sort(),
    )
  })
})

describe('clearDeviceAccountState', () => {
  it('efface le statut Plus, les rappels et les compteurs d’usage, et rien d’autre', () => {
    writeDeviceState()

    clearDeviceAccountState()

    expect(storage.keys().sort()).toEqual([...UNRELATED_KEYS].sort())
  })

  it('oublie aussi ce que le stockage n’a pas pu retenir', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqué', 'SecurityError')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    markPlusNudgeShown('firstPhoto')

    clearDeviceAccountState()

    expect(readPlusNudgeState().shown).toEqual([])
  })

  it('ne lève pas quand le stockage refuse l’effacement', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw new DOMException('bloqué', 'SecurityError')
    })

    expect(() => clearDeviceAccountState()).not.toThrow()
    expect(readUsageSignals().photo.count).toBe(0)
  })
})
