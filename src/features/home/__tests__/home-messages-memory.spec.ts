import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FRESH_HOME_MESSAGES,
  HOME_MESSAGES_STORAGE_KEY,
  readHomeMessagesMemory,
  rememberHomeMessages,
} from '../logic/home-messages-memory'

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
  vi.restoreAllMocks()
})

describe('mémoire des messages de l’accueil', () => {
  it('part de rien sur un appareil neuf', () => {
    expect(readHomeMessagesMemory()).toEqual(FRESH_HOME_MESSAGES)
  })

  it('retient chaque fermeture sans oublier les précédentes', () => {
    rememberHomeMessages({ protectClosed: true })
    rememberHomeMessages({ quarterlyClosedAt: '2026-10-06T10:00:00.000Z' })

    expect(readHomeMessagesMemory()).toEqual({
      ...FRESH_HOME_MESSAGES,
      protectClosed: true,
      quarterlyClosedAt: '2026-10-06T10:00:00.000Z',
    })
  })

  it('repart de rien devant un contenu illisible', () => {
    localStorage.setItem(HOME_MESSAGES_STORAGE_KEY, '{ "protectClosed": "oui" }')

    expect(readHomeMessagesMemory()).toEqual(FRESH_HOME_MESSAGES)
  })

  it('ne lève pas quand le stockage est indisponible, et garde la fermeture pour la session', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('stockage refusé')
      },
      setItem: () => {
        throw new Error('stockage refusé')
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(rememberHomeMessages({ protectClosed: true })).toEqual({
      ...FRESH_HOME_MESSAGES,
      protectClosed: true,
    })
  })
})
