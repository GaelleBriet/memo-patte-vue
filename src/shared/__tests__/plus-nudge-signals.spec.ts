import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NO_PLUS_NUDGE_SIGNALS,
  PLUS_NUDGE_SIGNALS_STORAGE_KEY,
  readPlusNudgeSignals,
  recordPlusNudgeSignal,
} from '../plus-nudge-signals'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signaux du rappel doux', () => {
  it('part de zéro quand rien n’a été enregistré', () => {
    expect(readPlusNudgeSignals()).toEqual(NO_PLUS_NUDGE_SIGNALS)
  })

  it('compte chaque signal enregistré', () => {
    recordPlusNudgeSignal('entry')
    recordPlusNudgeSignal('entry')
    recordPlusNudgeSignal('photo')

    expect(readPlusNudgeSignals()).toEqual({ photo: 1, animal: 0, entry: 2, export: 0 })
  })

  it('relit ce qu’un lancement précédent a enregistré', () => {
    localStorage.setItem(PLUS_NUDGE_SIGNALS_STORAGE_KEY, JSON.stringify({ animal: 3 }))

    expect(readPlusNudgeSignals()).toEqual({ photo: 0, animal: 3, entry: 0, export: 0 })
  })

  it('repart de zéro devant un contenu illisible', () => {
    localStorage.setItem(PLUS_NUDGE_SIGNALS_STORAGE_KEY, '{ "animal": "beaucoup" }')

    expect(readPlusNudgeSignals()).toEqual(NO_PLUS_NUDGE_SIGNALS)
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

    expect(() => recordPlusNudgeSignal('export')).not.toThrow()
    expect(readPlusNudgeSignals()).toEqual(NO_PLUS_NUDGE_SIGNALS)
  })
})
