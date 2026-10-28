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
})
