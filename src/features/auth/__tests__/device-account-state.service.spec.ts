// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANALYTICS_CONSENT_KEY } from '@/core/analytics/analytics'
import {
  markPlusNudgeShown,
  readPlusNudgeState,
  PLUS_NUDGE_STORAGE_KEY,
} from '@/features/purchase/plus-nudge'
import { PLUS_STATUS_STORAGE_KEY } from '@/features/purchase/plus-status-storage'
import { readUsageSignals, USAGE_SIGNALS_STORAGE_KEY } from '@/shared/usage-signals'

import { clearDeviceAccountState } from '../device-account-state.service'
import { memoryStorage, type MemoryStorage } from './auth-fixture'

let storage: MemoryStorage

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('clearDeviceAccountState', () => {
  it('efface le statut Plus, les signaux d’usage et les rappels, et rien d’autre', () => {
    storage.setItem(PLUS_STATUS_STORAGE_KEY, '{"plan":"annual","expiresAt":null}')
    storage.setItem(USAGE_SIGNALS_STORAGE_KEY, '{"photo":{"count":3,"lastAt":null}}')
    storage.setItem(PLUS_NUDGE_STORAGE_KEY, '{"shown":["firstPhoto"]}')
    storage.setItem(ANALYTICS_CONSENT_KEY, 'granted')
    storage.setItem('memopatte.notifications.primingAnswered', 'true')

    clearDeviceAccountState()

    expect(storage.keys().sort()).toEqual([
      ANALYTICS_CONSENT_KEY,
      'memopatte.notifications.primingAnswered',
    ])
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
