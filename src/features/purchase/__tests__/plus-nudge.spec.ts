import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { memoryStorage } from './billing-fixture'
import {
  PLUS_NUDGE_SPACING_DAYS,
  PLUS_NUDGE_STORAGE_KEY,
  markPlusNudgeShown,
  nextPlusNudge,
  readPlusNudgeState,
  stopPlusNudges,
} from '../plus-nudge'
import { recordPlusNudgeSignal } from '@/shared/plus-nudge-signals'

const NOW = new Date('2026-09-16T10:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('règles du rappel doux', () => {
  it('ne propose rien tant qu’aucun moment de valeur n’est atteint', () => {
    expect(nextPlusNudge()).toBeNull()
  })

  it('propose le rappel de la première photo', () => {
    recordPlusNudgeSignal('photo')

    expect(nextPlusNudge()).toBe('firstPhoto')
  })

  it('propose le rappel du carnet au deuxième animal', () => {
    recordPlusNudgeSignal('animal')
    expect(nextPlusNudge()).toBeNull()

    recordPlusNudgeSignal('animal')
    expect(nextPlusNudge()).toBe('carnetValue')
  })

  it('propose le rappel du carnet à la dixième entrée', () => {
    for (let index = 0; index < 9; index += 1) recordPlusNudgeSignal('entry')
    expect(nextPlusNudge()).toBeNull()

    recordPlusNudgeSignal('entry')
    expect(nextPlusNudge()).toBe('carnetValue')
  })

  it('propose le rappel du premier export', () => {
    recordPlusNudgeSignal('export')

    expect(nextPlusNudge()).toBe('firstExport')
  })

  it('ne montre qu’une fois le même déclencheur', () => {
    recordPlusNudgeSignal('photo')
    markPlusNudgeShown('firstPhoto')

    expect(nextPlusNudge()).toBeNull()
  })

  it('laisse passer trente jours avant le rappel suivant', () => {
    recordPlusNudgeSignal('photo')
    markPlusNudgeShown('firstPhoto')
    recordPlusNudgeSignal('export')

    expect(nextPlusNudge()).toBeNull()

    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'))
    expect(nextPlusNudge()).toBeNull()

    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
    expect(nextPlusNudge()).toBe('firstExport')
  })

  it('expose l’écart de trente jours', () => {
    expect(PLUS_NUDGE_SPACING_DAYS).toBe(30)
  })

  it('ne propose plus rien après « Ne plus me le proposer »', () => {
    recordPlusNudgeSignal('photo')
    stopPlusNudges()

    expect(nextPlusNudge()).toBeNull()
    expect(readPlusNudgeState().stopped).toBe(true)
  })

  it('persiste le refus et les rappels déjà montrés', () => {
    markPlusNudgeShown('carnetValue')
    stopPlusNudges()

    expect(readPlusNudgeState()).toEqual({
      shown: ['carnetValue'],
      lastShownAt: NOW.toISOString(),
      stopped: true,
    })
  })

  it('repart de zéro devant un état illisible', () => {
    localStorage.setItem(PLUS_NUDGE_STORAGE_KEY, 'pas du json')

    expect(readPlusNudgeState()).toEqual({ shown: [], lastShownAt: null, stopped: false })
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

    expect(() => stopPlusNudges()).not.toThrow()
    expect(readPlusNudgeState().stopped).toBe(false)
  })
})
