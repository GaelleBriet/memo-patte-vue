// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NO_STORED_PLUS,
  PLUS_STATUS_STORAGE_KEY,
  readStoredPlusStatus,
  writeStoredPlusStatus,
} from '../plus-status-storage'
import { memoryStorage } from './billing-fixture'

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('statut Plus en préférence locale', () => {
  it('relit le statut écrit', () => {
    writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-09-01T10:00:00Z' })

    expect(readStoredPlusStatus()).toEqual({
      plan: 'annual',
      expiresAt: '2027-09-01T10:00:00Z',
      lastSubscription: 'annual',
    })
    expect(localStorage.getItem(PLUS_STATUS_STORAGE_KEY)).not.toBeNull()
  })

  it('garde le dernier abonnement connu quand le droit a disparu', () => {
    writeStoredPlusStatus({ plan: 'none', expiresAt: null, lastSubscription: 'monthly' })

    expect(readStoredPlusStatus()).toEqual({
      plan: 'none',
      expiresAt: null,
      lastSubscription: 'monthly',
    })
  })

  it('déduit le dernier abonnement d’un statut enregistré avant ce champ', () => {
    localStorage.setItem(
      PLUS_STATUS_STORAGE_KEY,
      '{"plan":"monthly","expiresAt":"2026-09-01T10:00:00Z"}',
    )

    expect(readStoredPlusStatus().lastSubscription).toBe('monthly')
  })

  it('ne retient aucun abonnement derrière un achat à vie', () => {
    writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })

    expect(readStoredPlusStatus().lastSubscription).toBeNull()
  })

  it('renvoie « aucun » quand rien n’est enregistré', () => {
    expect(readStoredPlusStatus()).toEqual(NO_STORED_PLUS)
  })

  it('renvoie « aucun » quand la valeur enregistrée est illisible', () => {
    localStorage.setItem(PLUS_STATUS_STORAGE_KEY, '{"plan":"gold"}')
    expect(readStoredPlusStatus()).toEqual(NO_STORED_PLUS)

    localStorage.setItem(PLUS_STATUS_STORAGE_KEY, 'pas du json')
    expect(readStoredPlusStatus()).toEqual(NO_STORED_PLUS)
  })

  it('ne lève pas quand le stockage est inaccessible', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('bloqué', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('plein', 'QuotaExceededError')
      },
    })

    expect(() => writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })).not.toThrow()
    expect(readStoredPlusStatus()).toEqual(NO_STORED_PLUS)
  })
})
