// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANALYTICS_CONSENT_KEY } from '@/core/analytics/analytics'
import {
  markPlusNudgeShown,
  readPlusNudgeState,
  PLUS_NUDGE_STORAGE_KEY,
} from '@/features/purchase/logic/plus-nudge'
import { PLUS_STATUS_STORAGE_KEY } from '@/features/purchase/logic/plus-status-storage'
import {
  readUsageSignals,
  recordUsageSignal,
  USAGE_SIGNALS_STORAGE_KEY,
} from '@/shared/utils/usage-signals'

import { PLUS_ACCOUNT_STORAGE_KEY } from '../logic/plus-account-storage'
import { authRepository, type AuthRepository } from '../repository/auth.repository'
import {
  clearDeviceAccountState,
  clearSignedOutAccountState,
  isSignedInOnDevice,
  signOutDevice,
} from '../service/device-account-state.service'
import { memoryStorage, type MemoryStorage } from './auth-fixture'

vi.mock('../repository/auth.repository', () => ({
  authRepository: { signOut: vi.fn<AuthRepository['signOut']>(async () => {}) },
}))

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

describe('clearSignedOutAccountState, ce que le carnet a vécu', () => {
  it('garde les soins enregistrés et le dernier export JSON partagé', () => {
    recordUsageSignal('photo')
    recordUsageSignal('care')
    recordUsageSignal('jsonShare')

    clearSignedOutAccountState()

    const signals = readUsageSignals()
    expect(signals.photo.count).toBe(0)
    expect(signals.care.count).toBe(1)
    expect(signals.jsonShare.count).toBe(1)
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

describe('compte sur l’appareil', () => {
  const ACCOUNT = '{"userId":"5b0f3f0e-8a4c-4d1a-9c39-3f4f3b2f6a11"}'

  it('se sait connecté tant que le compte Plus est retenu sur l’appareil', () => {
    expect(isSignedInOnDevice()).toBe(false)

    storage.setItem(PLUS_ACCOUNT_STORAGE_KEY, ACCOUNT)

    expect(isSignedInOnDevice()).toBe(true)
  })

  it('se déconnecte de Supabase puis oublie le compte', async () => {
    storage.setItem(PLUS_ACCOUNT_STORAGE_KEY, ACCOUNT)

    await signOutDevice()

    expect(vi.mocked(authRepository).signOut).toHaveBeenCalledOnce()
    expect(isSignedInOnDevice()).toBe(false)
  })
})
