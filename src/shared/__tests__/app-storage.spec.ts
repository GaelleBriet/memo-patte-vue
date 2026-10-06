import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearAppStorage } from '../utils/app-storage'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('clearAppStorage', () => {
  it('retire toutes les clés de MémoPatte, et seulement elles', () => {
    localStorage.setItem('memopatte.analytics.consent', 'granted')
    localStorage.setItem('memopatte.weight.unit', 'lb')
    localStorage.setItem('memopatte.auth.session-user', '{}')
    localStorage.setItem('memo-patte:fixtures-token', 'maquettes-1')
    localStorage.setItem('autre-app', 'garde')

    clearAppStorage()

    expect(Object.keys(localStorage).sort()).toEqual(['autre-app', 'memo-patte:fixtures-token'])
  })

  it('ne lève pas quand le stockage est inaccessible', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new DOMException('bloqué', 'SecurityError')
    })
    localStorage.setItem('memopatte.weight.unit', 'lb')

    expect(() => clearAppStorage()).not.toThrow()
  })
})
