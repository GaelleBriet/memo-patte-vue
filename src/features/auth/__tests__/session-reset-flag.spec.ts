import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSessionReset, readSessionReset, writeSessionReset } from '../logic/session-reset-flag'
import { memoryStorage } from './auth-fixture'

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('drapeau de session illisible', () => {
  it('est absent au départ, posé puis effacé', () => {
    expect(readSessionReset()).toBe(false)

    writeSessionReset()
    expect(readSessionReset()).toBe(true)

    clearSessionReset()
    expect(readSessionReset()).toBe(false)
  })

  it('ne lève pas quand le stockage est inaccessible', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('bloqué', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('bloqué', 'SecurityError')
      },
      removeItem: () => {
        throw new DOMException('bloqué', 'SecurityError')
      },
    })

    expect(readSessionReset()).toBe(false)
    expect(() => writeSessionReset()).not.toThrow()
    expect(() => clearSessionReset()).not.toThrow()
  })
})
