// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPlusAccount,
  PLUS_ACCOUNT_STORAGE_KEY,
  readPlusAccount,
  writePlusAccount,
} from '../logic/plus-account-storage'
import { memoryStorage, USER_ID } from './auth-fixture'

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('drapeau « cet appareil a un compte Plus »', () => {
  it('relit le compte écrit', () => {
    writePlusAccount({ userId: USER_ID })

    expect(readPlusAccount()).toEqual({ userId: USER_ID })
  })

  it('est absent quand rien n’est enregistré', () => {
    expect(readPlusAccount()).toBeNull()
  })

  it('est absent après effacement', () => {
    writePlusAccount({ userId: USER_ID })

    clearPlusAccount()

    expect(readPlusAccount()).toBeNull()
  })

  it('est absent quand la valeur enregistrée est illisible', () => {
    localStorage.setItem(PLUS_ACCOUNT_STORAGE_KEY, '{"userId":"pas-un-uuid"}')
    expect(readPlusAccount()).toBeNull()

    localStorage.setItem(PLUS_ACCOUNT_STORAGE_KEY, 'pas du json')
    expect(readPlusAccount()).toBeNull()
  })

  it('ne lève pas quand le stockage est inaccessible', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocked = () => {
      throw new DOMException('bloqué', 'SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })

    expect(() => writePlusAccount({ userId: USER_ID })).not.toThrow()
    expect(() => clearPlusAccount()).not.toThrow()
    expect(readPlusAccount()).toBeNull()
  })
})
