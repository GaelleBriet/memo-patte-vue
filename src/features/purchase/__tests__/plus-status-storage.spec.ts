// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NO_STORED_PLUS,
  PLUS_STATUS_STORAGE_KEY,
  readStoredPlusStatus,
  writeStoredPlusStatus,
} from '../logic/plus-status-storage'
import { memoryStorage } from './billing-fixture'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-16T10:00:00Z') })
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.useRealTimers()
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
      subscriptionEndedAt: null,
    })
    expect(localStorage.getItem(PLUS_STATUS_STORAGE_KEY)).not.toBeNull()
  })

  it('garde le dernier abonnement connu quand le droit a disparu', () => {
    writeStoredPlusStatus({
      plan: 'none',
      expiresAt: null,
      lastSubscription: 'monthly',
      subscriptionEndedAt: '2026-09-11T10:00:00Z',
    })

    expect(readStoredPlusStatus()).toEqual({
      plan: 'none',
      expiresAt: null,
      lastSubscription: 'monthly',
      subscriptionEndedAt: '2026-09-11T10:00:00Z',
    })
  })

  it('déduit le dernier abonnement et sa fin d’un statut enregistré avant ces champs', () => {
    localStorage.setItem(
      PLUS_STATUS_STORAGE_KEY,
      '{"plan":"monthly","expiresAt":"2026-09-01T10:00:00Z"}',
    )

    expect(readStoredPlusStatus()).toMatchObject({
      lastSubscription: 'monthly',
      subscriptionEndedAt: '2026-09-01T10:00:00Z',
    })
  })

  it('ne date pas la fin d’un abonnement encore en cours', () => {
    writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-09-01T10:00:00Z' })

    expect(readStoredPlusStatus().subscriptionEndedAt).toBeNull()
  })

  it.each([
    ['5 jours', '2026-09-11T10:00:00Z', 'monthly'],
    ['29 jours', '2026-08-18T10:00:00Z', 'monthly'],
  ])('garde le souvenir %s après la fin de l’abonnement', (_, endedAt, expected) => {
    writeStoredPlusStatus({
      plan: 'none',
      expiresAt: null,
      lastSubscription: 'monthly',
      subscriptionEndedAt: endedAt,
    })

    expect(readStoredPlusStatus().lastSubscription).toBe(expected)
  })

  it('oublie l’abonnement 30 jours après sa fin', () => {
    writeStoredPlusStatus({
      plan: 'none',
      expiresAt: null,
      lastSubscription: 'monthly',
      subscriptionEndedAt: '2026-08-17T10:00:00Z',
    })

    expect(readStoredPlusStatus()).toEqual(NO_STORED_PLUS)
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
