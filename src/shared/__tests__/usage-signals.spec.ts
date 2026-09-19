import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NO_USAGE_SIGNALS,
  USAGE_SIGNAL_CAP,
  USAGE_SIGNALS_STORAGE_KEY,
  readUsageSignals,
  recordUsageSignal,
} from '../utils/usage-signals'

const NOW = new Date('2026-09-16T10:00:00Z')

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('signaux d’usage', () => {
  it('part de zéro quand rien n’a été enregistré', () => {
    expect(readUsageSignals()).toEqual(NO_USAGE_SIGNALS)
  })

  it('compte chaque signal et retient sa date', () => {
    recordUsageSignal('entry')
    recordUsageSignal('entry')
    recordUsageSignal('photo')

    expect(readUsageSignals()).toEqual({
      photo: { count: 1, lastAt: NOW.toISOString() },
      entry: { count: 2, lastAt: NOW.toISOString() },
      export: { count: 0, lastAt: null },
    })
  })

  it('plafonne le compteur', () => {
    localStorage.setItem(
      USAGE_SIGNALS_STORAGE_KEY,
      JSON.stringify({ entry: { count: USAGE_SIGNAL_CAP, lastAt: NOW.toISOString() } }),
    )

    recordUsageSignal('entry')

    expect(readUsageSignals().entry.count).toBe(USAGE_SIGNAL_CAP)
  })

  it('relit ce qu’un lancement précédent a enregistré', () => {
    localStorage.setItem(
      USAGE_SIGNALS_STORAGE_KEY,
      JSON.stringify({ export: { count: 3, lastAt: '2026-09-01T08:00:00Z' } }),
    )

    expect(readUsageSignals().export).toEqual({ count: 3, lastAt: '2026-09-01T08:00:00Z' })
  })

  it('repart de zéro devant un contenu illisible', () => {
    localStorage.setItem(USAGE_SIGNALS_STORAGE_KEY, '{ "entry": "beaucoup" }')

    expect(readUsageSignals()).toEqual(NO_USAGE_SIGNALS)
  })

  it('ne lève pas quand le stockage est indisponible', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('stockage refusé')
      },
      setItem: () => {
        throw new Error('stockage refusé')
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => recordUsageSignal('export')).not.toThrow()
    expect(readUsageSignals()).toEqual(NO_USAGE_SIGNALS)
  })
})
