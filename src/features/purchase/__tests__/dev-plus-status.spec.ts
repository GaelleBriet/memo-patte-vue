// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyDevPlusStatus, DEV_PLUS_STATUS_MARKER } from '../logic/dev-plus-status'
import { NO_PLUS } from '../logic/plus-status'
import {
  readStoredPlusStatus,
  writeStoredPlusStatus,
  type StoredPlusStatus,
} from '../logic/plus-status-storage'
import { usePurchaseStore } from '../store/purchase.store'
import { memoryStorage } from './billing-fixture'

const NOW = new Date('2026-09-23T10:00:00.000Z')

const EXPIRED_MONTHLY: StoredPlusStatus = {
  plan: 'monthly',
  expiresAt: '2026-09-20T10:00:00.000Z',
  lastSubscription: 'monthly',
  subscriptionEndedAt: '2026-09-20T10:00:00.000Z',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('applyDevPlusStatus', () => {
  it.each<[string, StoredPlusStatus]>([
    [
      'lifetime',
      { plan: 'lifetime', expiresAt: null, lastSubscription: null, subscriptionEndedAt: null },
    ],
    [
      'annual',
      {
        plan: 'annual',
        expiresAt: '2027-09-23T10:00:00.000Z',
        lastSubscription: 'annual',
        subscriptionEndedAt: null,
      },
    ],
    [
      'monthly',
      {
        plan: 'monthly',
        expiresAt: '2026-10-23T10:00:00.000Z',
        lastSubscription: 'monthly',
        subscriptionEndedAt: null,
      },
    ],
    ['expired', EXPIRED_MONTHLY],
  ])('« %s » écrit le statut Plus correspondant', (requested, expected) => {
    applyDevPlusStatus(requested)

    expect(readStoredPlusStatus()).toEqual(expected)
  })

  it('« none » revient au gratuit et efface la mémoire d’abonnement', () => {
    writeStoredPlusStatus(EXPIRED_MONTHLY)

    applyDevPlusStatus('none')

    expect(readStoredPlusStatus()).toEqual({
      plan: 'none',
      expiresAt: null,
      lastSubscription: null,
      subscriptionEndedAt: null,
    })
  })

  it('« expired » se lit comme un abonnement mensuel échu', () => {
    applyDevPlusStatus('expired')

    const purchase = usePurchaseStore()
    expect(purchase.status).toEqual(NO_PLUS)
    expect(purchase.expiredPlan).toBe('monthly')
  })

  it.each([undefined, ''])('variable absente (%j) : rien n’est écrit', (requested) => {
    writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-01-01T00:00:00.000Z' })
    const setItem = vi.spyOn(localStorage, 'setItem')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    applyDevPlusStatus(requested)

    expect(setItem).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('valeur inconnue : rien n’est écrit et un avertissement nomme la valeur', () => {
    const setItem = vi.spyOn(localStorage, 'setItem')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    applyDevPlusStatus('gold')

    expect(setItem).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('gold')
    // Lu à l'exécution : c'est lui que `pnpm test:build` cherche dans le bundle.
    expect(message).toContain(DEV_PLUS_STATUS_MARKER)
  })
})
