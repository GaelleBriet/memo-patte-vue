import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { memoryStorage } from './billing-fixture'
import {
  PLUS_NUDGE_ANIMALS,
  PLUS_NUDGE_ENTRIES,
  PLUS_NUDGE_SPACING_DAYS,
  PLUS_NUDGE_STORAGE_KEY,
  forgetPlusNudgeSession,
  markPlusNudgeShown,
  nextPlusNudge,
  readPlusNudgeState,
  stopPlusNudges,
} from '../logic/plus-nudge'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

const NOW = new Date('2026-09-16T10:00:00Z')

const SEUL = { animals: 1 }
const FOYER = { animals: PLUS_NUDGE_ANIMALS }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vi.stubGlobal('localStorage', memoryStorage())
  forgetPlusNudgeSession()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('règles du rappel doux', () => {
  it('ne propose rien tant qu’aucun moment de valeur n’est atteint', () => {
    expect(nextPlusNudge(SEUL)).toBeNull()
  })

  it('propose le rappel de la première photo', () => {
    recordUsageSignal('photo')

    expect(nextPlusNudge(SEUL)).toBe('firstPhoto')
  })

  it('propose le rappel du carnet au deuxième animal, sans rien enregistrer', () => {
    expect(nextPlusNudge(SEUL)).toBeNull()
    expect(nextPlusNudge(FOYER)).toBe('carnetValue')
  })

  it('propose le rappel du carnet à la dixième entrée', () => {
    for (let index = 0; index < PLUS_NUDGE_ENTRIES - 1; index += 1) recordUsageSignal('entry')
    expect(nextPlusNudge(SEUL)).toBeNull()

    recordUsageSignal('entry')
    expect(nextPlusNudge(SEUL)).toBe('carnetValue')
  })

  it('propose le rappel du premier export', () => {
    recordUsageSignal('export')

    expect(nextPlusNudge(SEUL)).toBe('firstExport')
  })

  it('parle du moment de valeur le plus frais, pas du premier déclaré', () => {
    recordUsageSignal('photo')
    vi.setSystemTime(new Date('2026-09-16T11:00:00Z'))
    recordUsageSignal('export')

    expect(nextPlusNudge(SEUL)).toBe('firstExport')
  })

  it('ne montre qu’une fois le même déclencheur', () => {
    recordUsageSignal('photo')
    markPlusNudgeShown('firstPhoto')

    expect(nextPlusNudge(SEUL)).toBeNull()
  })

  it('laisse passer trente jours avant le rappel suivant', () => {
    recordUsageSignal('photo')
    markPlusNudgeShown('firstPhoto')
    recordUsageSignal('export')

    expect(nextPlusNudge(SEUL)).toBeNull()

    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'))
    expect(nextPlusNudge(SEUL)).toBeNull()

    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
    expect(nextPlusNudge(SEUL)).toBe('firstExport')
  })

  it('expose l’écart de trente jours', () => {
    expect(PLUS_NUDGE_SPACING_DAYS).toBe(30)
  })

  it('ne gèle pas les rappels quand l’horloge recule', () => {
    recordUsageSignal('photo')
    markPlusNudgeShown('firstPhoto')
    recordUsageSignal('export')

    vi.setSystemTime(new Date('2026-08-01T10:00:00Z'))

    expect(nextPlusNudge(SEUL)).toBeNull()
    expect(readPlusNudgeState().lastShownAt).toBe('2026-08-01T10:00:00.000Z')

    vi.setSystemTime(new Date('2026-08-31T10:00:00Z'))
    expect(nextPlusNudge(SEUL)).toBe('firstExport')
  })

  it('ne propose plus rien après « Ne plus me le proposer »', () => {
    recordUsageSignal('photo')
    stopPlusNudges()

    expect(nextPlusNudge(SEUL)).toBeNull()
    expect(readPlusNudgeState().stopped).toBe(true)
  })

  it('persiste le refus et les rappels déjà montrés', () => {
    markPlusNudgeShown('carnetValue')
    stopPlusNudges()

    expect(JSON.parse(localStorage.getItem(PLUS_NUDGE_STORAGE_KEY)!)).toEqual({
      shown: ['carnetValue'],
      lastShownAt: NOW.toISOString(),
      stopped: true,
    })
  })

  it('repart de zéro devant un état illisible', () => {
    localStorage.setItem(PLUS_NUDGE_STORAGE_KEY, 'pas du json')

    expect(readPlusNudgeState()).toEqual({ shown: [], lastShownAt: null, stopped: false })
  })

  it('tient le refus toute la session même si le stockage refuse d’écrire', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('stockage refusé')
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    recordUsageSignal('photo')

    expect(() => stopPlusNudges()).not.toThrow()
    expect(readPlusNudgeState().stopped).toBe(true)
    expect(nextPlusNudge(SEUL)).toBeNull()
  })

  it('tient « un rappel par déclencheur » même si le stockage refuse d’écrire', () => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === PLUS_NUDGE_STORAGE_KEY) throw new Error('stockage refusé')
        items.set(key, value)
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    recordUsageSignal('photo')
    markPlusNudgeShown('firstPhoto')

    expect(nextPlusNudge(SEUL)).toBeNull()
  })
})
