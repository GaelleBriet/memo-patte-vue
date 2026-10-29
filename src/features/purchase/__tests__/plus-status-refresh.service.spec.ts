import type { PluginListenerHandle } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { billingService, type BillingService } from '../service/billing.service'
import { NO_PLUS, type PlusStatus } from '../logic/plus-status'
import { writeStoredPlusStatus } from '../logic/plus-status-storage'
import { installPlusStatusRefresh } from '../service/plus-status-refresh.service'
import { usePurchaseStore } from '../store/purchase.store'
import { memoryStorage } from './billing-fixture'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'

type NetworkListener = (status: { connected: boolean; connectionType: string }) => void
type AddNetworkListener = (
  event: string,
  listener: NetworkListener,
) => Promise<PluginListenerHandle>

vi.mock('@capacitor/network', () => ({
  Network: { addListener: vi.fn<AddNetworkListener>(), getStatus: () => new Promise(() => {}) },
}))

vi.mock('../service/billing.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  billingService: {
    isAvailable: vi.fn<BillingService['isAvailable']>(() => true),
    fetchStatus: vi.fn<BillingService['fetchStatus']>(),
  },
}))

const service = vi.mocked(billingService)
const ENDING: PlusStatus = { plan: 'monthly', expiresAt: '2026-09-20T10:00:00Z' }
const addNetworkListener = Network.addListener as unknown as Mock<AddNetworkListener>
let networkListeners: Set<NetworkListener>

function networkBack(): void {
  for (const listener of networkListeners) listener({ connected: true, connectionType: 'wifi' })
}

describe('installPlusStatusRefresh', () => {
  let uninstall: () => void = () => {}

  beforeEach(() => {
    vi.clearAllMocks()
    networkListeners = new Set()
    addNetworkListener.mockImplementation(async (_, listener) => {
      networkListeners.add(listener)
      return { remove: async () => void networkListeners.delete(listener) }
    })
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-15T10:00:00Z') })
    vi.stubGlobal('localStorage', memoryStorage())
    writeStoredPlusStatus(ENDING)
    setActivePinia(createPinia())
  })

  afterEach(() => {
    uninstall()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('revérifie le statut Plus au lancement', async () => {
    service.fetchStatus.mockResolvedValue(ENDING)

    uninstall = installPlusStatusRefresh()
    await vi.waitFor(() => expect(service.fetchStatus).toHaveBeenCalledOnce())
  })

  it('lit « aucun » au retour au premier plan après l’échéance, sans redémarrer', async () => {
    service.fetchStatus.mockResolvedValueOnce(ENDING).mockResolvedValueOnce(NO_PLUS)
    uninstall = installPlusStatusRefresh()
    const store = usePurchaseStore()
    await vi.waitFor(() => expect(service.fetchStatus).toHaveBeenCalledOnce())
    expect(store.status).toEqual(ENDING)
    vi.setSystemTime(new Date('2026-09-21T10:00:00Z'))

    simulateWebResume()

    await vi.waitFor(() => expect(store.status).toEqual(NO_PLUS))
    expect(service.fetchStatus).toHaveBeenCalledTimes(2)
  })

  it('revérifie le statut Plus au retour du réseau, app restée au premier plan', async () => {
    service.fetchStatus.mockResolvedValueOnce(NO_PLUS).mockResolvedValueOnce(ENDING)
    uninstall = installPlusStatusRefresh()
    const store = usePurchaseStore()
    await vi.waitFor(() => expect(store.status).toEqual(NO_PLUS))

    networkBack()

    await vi.waitFor(() => expect(store.status).toEqual(ENDING))
    expect(service.fetchStatus).toHaveBeenCalledTimes(2)
  })

  it('ne revérifie plus une fois désinstallé', async () => {
    service.fetchStatus.mockResolvedValue(ENDING)
    installPlusStatusRefresh()()
    await vi.waitFor(() => expect(service.fetchStatus).toHaveBeenCalledOnce())

    simulateWebResume()
    networkBack()

    expect(service.fetchStatus).toHaveBeenCalledOnce()
  })

  describe('app restée ouverte au passage de l’échéance', () => {
    const MINUTE = 60_000
    const DAY = 24 * 60 * MINUTE
    const LONGEST_TIMEOUT = 2_147_483_647
    const MONTHLY: PlusStatus = { plan: 'monthly', expiresAt: '2026-09-15T10:05:00Z' }
    const RENEWED: PlusStatus = { plan: 'monthly', expiresAt: '2026-10-15T10:05:00Z' }
    const ANNUAL: PlusStatus = { plan: 'annual', expiresAt: '2027-09-15T10:00:00Z' }
    const LIFETIME: PlusStatus = { plan: 'lifetime', expiresAt: null }

    function launchWith(status: PlusStatus): ReturnType<typeof usePurchaseStore> {
      writeStoredPlusStatus(status)
      uninstall = installPlusStatusRefresh()
      return usePurchaseStore()
    }

    beforeEach(() => {
      service.fetchStatus.mockReset()
      vi.useRealTimers()
      vi.useFakeTimers({
        toFake: ['Date', 'setTimeout', 'clearTimeout'],
        now: new Date('2026-09-15T10:00:00Z'),
      })
    })

    it('relit le statut juste après l’échéance, et l’écran passe à « expiré » sans autre événement', async () => {
      service.fetchStatus.mockResolvedValueOnce(MONTHLY).mockResolvedValueOnce(NO_PLUS)
      const store = launchWith(MONTHLY)
      await vi.advanceTimersByTimeAsync(0)
      expect(service.fetchStatus).toHaveBeenCalledOnce()

      await vi.advanceTimersByTimeAsync(5 * MINUTE)
      expect(store.status).toEqual(MONTHLY)

      await vi.advanceTimersByTimeAsync(5 * MINUTE)
      expect(service.fetchStatus).toHaveBeenCalledTimes(2)
      expect(store.status).toEqual(NO_PLUS)
      expect(store.expiredPlan).toBe('monthly')
    })

    it('passe à « expiré » même quand RevenueCat rend encore la même échéance, avec un seul réessai espacé', async () => {
      service.fetchStatus.mockResolvedValue(MONTHLY)
      const store = launchWith(MONTHLY)

      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(service.fetchStatus).toHaveBeenCalledTimes(2)
      expect(store.status).toEqual(NO_PLUS)

      await vi.advanceTimersByTimeAsync(DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(3)
      expect(store.status).toEqual(NO_PLUS)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('passe à « expiré » hors connexion, avec un seul réessai espacé', async () => {
      service.fetchStatus.mockResolvedValueOnce(MONTHLY).mockRejectedValue(new Error('offline'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = launchWith(MONTHLY)

      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(store.status).toEqual(NO_PLUS)

      await vi.advanceTimersByTimeAsync(DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(3)
    })

    it('retrouve un renouvellement au réessai, et attend sa nouvelle échéance', async () => {
      service.fetchStatus
        .mockResolvedValueOnce(MONTHLY)
        .mockResolvedValueOnce(MONTHLY)
        .mockResolvedValueOnce(RENEWED)
      const store = launchWith(MONTHLY)

      await vi.advanceTimersByTimeAsync(DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(3)
      expect(store.status).toEqual(RENEWED)

      await vi.advanceTimersByTimeAsync(20 * DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(3)
    })

    it('réarme la minuterie sur l’échéance d’un renouvellement', async () => {
      service.fetchStatus
        .mockResolvedValueOnce(MONTHLY)
        .mockResolvedValueOnce(RENEWED)
        .mockResolvedValueOnce(NO_PLUS)
      const store = launchWith(MONTHLY)

      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(store.status).toEqual(RENEWED)

      await vi.advanceTimersByTimeAsync(29 * DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(3)
      expect(store.status).toEqual(NO_PLUS)
    })

    it('ne dépasse jamais le plus long délai d’une minuterie pour une échéance lointaine', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      service.fetchStatus.mockResolvedValueOnce(ANNUAL).mockResolvedValueOnce(NO_PLUS)
      const store = launchWith(ANNUAL)

      await vi.advanceTimersByTimeAsync(MINUTE)
      expect(service.fetchStatus).toHaveBeenCalledOnce()

      await vi.advanceTimersByTimeAsync(364 * DAY)
      expect(service.fetchStatus).toHaveBeenCalledOnce()
      expect(store.status).toEqual(ANNUAL)

      await vi.advanceTimersByTimeAsync(DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(2)
      expect(store.status).toEqual(NO_PLUS)
      const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay ?? 0)
      expect(Math.max(...delays)).toBeLessThanOrEqual(LONGEST_TIMEOUT)
    })

    it('n’arme aucune minuterie pour Plus à vie', async () => {
      service.fetchStatus.mockResolvedValue(LIFETIME)
      launchWith(LIFETIME)
      await vi.advanceTimersByTimeAsync(0)

      expect(vi.getTimerCount()).toBe(0)
    })

    it('ne relit plus le statut à l’échéance une fois désinstallé', async () => {
      service.fetchStatus.mockResolvedValue(MONTHLY)
      launchWith(MONTHLY)
      await vi.advanceTimersByTimeAsync(0)

      uninstall()

      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(DAY)
      expect(service.fetchStatus).toHaveBeenCalledOnce()
    })

    it('n’arme pas de réessai quand l’arrêt arrive pendant la relecture de l’échéance', async () => {
      let answer: (status: PlusStatus) => void = () => {}
      service.fetchStatus
        .mockResolvedValueOnce(MONTHLY)
        .mockReturnValueOnce(new Promise<PlusStatus>((resolve) => (answer = resolve)))
      launchWith(MONTHLY)
      await vi.advanceTimersByTimeAsync(6 * MINUTE)
      expect(service.fetchStatus).toHaveBeenCalledTimes(2)

      uninstall()
      answer(MONTHLY)

      await vi.advanceTimersByTimeAsync(DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(2)
    })

    it('abandonne le réessai une fois désinstallé', async () => {
      service.fetchStatus.mockResolvedValue(MONTHLY)
      launchWith(MONTHLY)
      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(service.fetchStatus).toHaveBeenCalledTimes(2)

      uninstall()

      await vi.advanceTimersByTimeAsync(DAY)
      expect(service.fetchStatus).toHaveBeenCalledTimes(2)
    })
  })
})
