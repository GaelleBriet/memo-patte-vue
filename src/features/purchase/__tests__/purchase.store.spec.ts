// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BillingError, billingService, type BillingService } from '../billing.service'
import { NO_PLUS, type PlusStatus } from '../plus-status'
import {
  NO_STORED_PLUS,
  readStoredPlusStatus,
  writeStoredPlusStatus,
  type StoredPlusStatus,
} from '../plus-status-storage'
import { usePurchaseStore } from '../purchase.store'
import { memoryStorage } from './billing-fixture'

vi.mock('../billing.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  billingService: {
    isAvailable: vi.fn<BillingService['isAvailable']>(() => true),
    listOffers: vi.fn<BillingService['listOffers']>(),
    purchase: vi.fn<BillingService['purchase']>(),
    fetchStatus: vi.fn<BillingService['fetchStatus']>(),
    restore: vi.fn<BillingService['restore']>(),
    logIn: vi.fn<BillingService['logIn']>(),
  },
}))

const service = vi.mocked(billingService)

const ANNUAL: PlusStatus = { plan: 'annual', expiresAt: '2027-09-01T10:00:00Z' }
const LIFETIME: PlusStatus = { plan: 'lifetime', expiresAt: null }

function stored(status: PlusStatus, lastSubscription: StoredPlusStatus['lastSubscription'] = null) {
  return { ...status, lastSubscription }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePurchaseStore', () => {
  it('part du statut enregistré localement', () => {
    writeStoredPlusStatus(ANNUAL)

    expect(usePurchaseStore().status).toEqual(ANNUAL)
  })

  describe('abonnement dont la date d’expiration est passée', () => {
    const LAPSED: PlusStatus = { plan: 'monthly', expiresAt: '2026-09-01T10:00:00Z' }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-15T10:00:00Z') })
      writeStoredPlusStatus(LAPSED)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('se lit « aucun » sans effacer le statut enregistré', () => {
      expect(usePurchaseStore().status).toEqual(NO_PLUS)
      expect(readStoredPlusStatus()).toEqual(stored(LAPSED, 'monthly'))
    })

    it('reste revérifié au lancement, pour retrouver un renouvellement', async () => {
      const renewed: PlusStatus = { plan: 'monthly', expiresAt: '2026-10-01T10:00:00Z' }
      service.fetchStatus.mockResolvedValueOnce(renewed)
      const store = usePurchaseStore()

      await store.verifyKnownStatus()

      expect(store.status).toEqual(renewed)
    })

    it('nomme le plan échu, pour dire « expiré » plutôt que « gratuit »', () => {
      expect(usePurchaseStore().expiredPlan).toBe('monthly')
    })

    it('oublie le plan échu dès qu’un renouvellement est connu', async () => {
      service.fetchStatus.mockResolvedValueOnce({
        plan: 'monthly',
        expiresAt: '2026-10-01T10:00:00Z',
      })
      const store = usePurchaseStore()

      await store.verifyKnownStatus()

      expect(store.expiredPlan).toBeNull()
    })

    it('se souvient du plan échu une fois l’expiration confirmée par Google Play', async () => {
      service.fetchStatus.mockResolvedValueOnce(NO_PLUS)
      const store = usePurchaseStore()

      await store.verifyKnownStatus()

      expect(store.status).toEqual(NO_PLUS)
      expect(store.expiredPlan).toBe('monthly')
      expect(readStoredPlusStatus()).toEqual(stored(NO_PLUS, 'monthly'))
    })

    it('oublie le plan échu dès que Plus est réactivé', async () => {
      service.fetchStatus.mockResolvedValueOnce(NO_PLUS)
      service.restore.mockResolvedValueOnce(ANNUAL)
      const store = usePurchaseStore()
      await store.verifyKnownStatus()

      await store.restore()

      expect(store.expiredPlan).toBeNull()
      expect(readStoredPlusStatus()).toEqual(stored(ANNUAL, 'annual'))
    })
  })

  it('n’invente aucun plan échu à qui n’a jamais payé, même après vérification', async () => {
    const store = usePurchaseStore()

    await store.verifyKnownStatus()

    expect(service.fetchStatus).not.toHaveBeenCalled()
    expect(store.expiredPlan).toBeNull()
    expect(readStoredPlusStatus()).toEqual(NO_STORED_PLUS)
  })

  it.each([
    ['un utilisateur qui n’a jamais payé', NO_PLUS],
    ['un abonnement en cours', ANNUAL],
    ['un achat à vie', LIFETIME],
  ])('ne rapporte aucun plan échu pour %s', (_, status) => {
    writeStoredPlusStatus(status)

    expect(usePurchaseStore().expiredPlan).toBeNull()
  })

  it('expose la disponibilité des achats', () => {
    service.isAvailable.mockReturnValueOnce(false)

    expect(usePurchaseStore().available).toBe(false)
  })

  describe('verifyKnownStatus', () => {
    it('ne contacte pas le store pour un utilisateur gratuit', async () => {
      await usePurchaseStore().verifyKnownStatus()

      expect(service.fetchStatus).not.toHaveBeenCalled()
    })

    it('revérifie un statut Plus connu et enregistre la réponse', async () => {
      writeStoredPlusStatus(ANNUAL)
      service.fetchStatus.mockResolvedValueOnce(LIFETIME)
      const store = usePurchaseStore()

      await store.verifyKnownStatus()

      expect(store.status).toEqual(LIFETIME)
      expect(readStoredPlusStatus()).toEqual(stored(LIFETIME))
    })

    it('n’écrase pas le statut d’une action plus récente', async () => {
      writeStoredPlusStatus(ANNUAL)
      let answer: (status: PlusStatus) => void = () => {}
      service.fetchStatus.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve
        }),
      )
      service.restore.mockResolvedValueOnce(LIFETIME)
      const store = usePurchaseStore()

      const verification = store.verifyKnownStatus()
      await store.restore()
      answer(NO_PLUS)
      await verification

      expect(store.status).toEqual(LIFETIME)
      expect(readStoredPlusStatus()).toEqual(stored(LIFETIME))
    })

    it('passe à « aucun » un abonnement expiré', async () => {
      writeStoredPlusStatus(ANNUAL)
      service.fetchStatus.mockResolvedValueOnce(NO_PLUS)
      const store = usePurchaseStore()

      await store.verifyKnownStatus()

      expect(store.status).toEqual(NO_PLUS)
      expect(readStoredPlusStatus()).toEqual(stored(NO_PLUS, 'annual'))
    })

    it('garde le statut connu quand la vérification échoue, sans lever', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      writeStoredPlusStatus(ANNUAL)
      service.fetchStatus.mockRejectedValueOnce(new BillingError('failed'))
      const store = usePurchaseStore()

      await expect(store.verifyKnownStatus()).resolves.toBe(false)

      expect(store.status).toEqual(ANNUAL)
      expect(readStoredPlusStatus()).toEqual(stored(ANNUAL, 'annual'))
    })
  })

  describe('loadOffers', () => {
    it('expose les offres', async () => {
      service.listOffers.mockResolvedValueOnce([{ plan: 'annual', priceString: '9,99 €' }])
      const store = usePurchaseStore()

      await expect(store.loadOffers()).resolves.toBe(true)

      expect(store.offers).toEqual([{ plan: 'annual', priceString: '9,99 €' }])
      expect(store.error).toBeNull()
    })

    it('renseigne l’erreur sans lever', async () => {
      const failure = new BillingError('failed')
      service.listOffers.mockRejectedValueOnce(failure)
      const store = usePurchaseStore()

      await expect(store.loadOffers()).resolves.toBe(false)

      expect(store.error).toBe(failure)
    })
  })

  describe('purchase', () => {
    it('enregistre le statut après un achat', async () => {
      service.purchase.mockResolvedValueOnce({ kind: 'purchased', status: LIFETIME })
      const store = usePurchaseStore()

      await expect(store.purchase('lifetime')).resolves.toEqual({
        kind: 'purchased',
        status: LIFETIME,
      })

      expect(store.status).toEqual(LIFETIME)
      expect(readStoredPlusStatus()).toEqual(stored(LIFETIME))
    })

    it('ne change rien quand l’achat est annulé', async () => {
      service.purchase.mockResolvedValueOnce({ kind: 'cancelled' })
      const store = usePurchaseStore()

      await expect(store.purchase('annual')).resolves.toEqual({ kind: 'cancelled' })

      expect(store.status).toEqual(NO_PLUS)
    })

    it('lève en cas d’échec', async () => {
      service.purchase.mockRejectedValueOnce(new BillingError('unavailable'))

      await expect(usePurchaseStore().purchase('annual')).rejects.toBeInstanceOf(BillingError)
    })
  })

  it('restore et logIn enregistrent le statut renvoyé', async () => {
    service.restore.mockResolvedValueOnce(ANNUAL)
    service.logIn.mockResolvedValueOnce(LIFETIME)
    const store = usePurchaseStore()

    await store.restore()
    expect(store.status).toEqual(ANNUAL)

    await store.logIn('0f8fad5b-d9cb-469f-a165-70867728950e')
    expect(store.status).toEqual(LIFETIME)
    expect(readStoredPlusStatus()).toEqual(stored(LIFETIME))
  })
})
