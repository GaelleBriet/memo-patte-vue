import type { PluginListenerHandle } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import type { RestoreFlow } from '@/core/sync/service/restore-flow'
import { SYNC_DEBOUNCE_MS } from '@/core/sync/service/sync-scheduler'
import { memoryStorage, USER_ID } from '@/features/auth/__tests__/auth-fixture'
import { authRepository, type AuthRepository } from '@/features/auth/repository/auth.repository'
import { provideAuthRepository, useAuthStore } from '@/features/auth/store/auth.store'
import { NO_PLUS, type PlusStatus } from '@/features/purchase/logic/plus-status'
import { billingService, type BillingService } from '@/features/purchase/service/billing.service'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import {
  createPlusPhone,
  isPlusEligible,
  launchPlusApp,
  phoneCheckout,
  type PlusPhone,
} from './plus-phone'

type NetworkListener = (status: { connected: boolean; connectionType: string }) => void
type AddNetworkListener = (
  event: string,
  listener: NetworkListener,
) => Promise<PluginListenerHandle>

vi.mock('@capacitor/network', () => ({
  Network: { addListener: vi.fn<AddNetworkListener>(), getStatus: () => new Promise(() => {}) },
}))

vi.mock('@/features/auth/repository/auth.repository', () => ({
  authRepository: {
    signUp: vi.fn<AuthRepository['signUp']>(),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
    restoreSession: vi.fn<AuthRepository['restoreSession']>(),
    refreshSession: vi.fn<AuthRepository['refreshSession']>(),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
    onSessionUnreadable: vi.fn<AuthRepository['onSessionUnreadable']>(),
  },
}))

vi.mock('@/features/purchase/service/billing.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  billingService: {
    isAvailable: vi.fn<BillingService['isAvailable']>(() => true),
    listOffers: vi.fn<BillingService['listOffers']>(),
    purchase: vi.fn<BillingService['purchase']>(),
    fetchStatus: vi.fn<BillingService['fetchStatus']>(),
    restore: vi.fn<BillingService['restore']>(),
    logIn: vi.fn<BillingService['logIn']>(),
    logOut: vi.fn<BillingService['logOut']>(),
  },
}))

const addNetworkListener = Network.addListener as unknown as Mock<AddNetworkListener>
const repository = vi.mocked(authRepository)
provideAuthRepository(() => authRepository)
const billing = vi.mocked(billingService)

const ANNUAL: PlusStatus = { plan: 'annual', expiresAt: '2027-10-29T09:00:00.000Z' }

let server: FakeSyncServer
let db: InMemoryDb
let phone: PlusPhone
let flow: RestoreFlow
let stop: () => void = () => {}

async function launch(): Promise<RestoreFlow> {
  const app = await launchPlusApp(phone)
  stop = app.stop
  return app.flow
}

async function createAccount(): Promise<void> {
  repository.signUp.mockResolvedValueOnce({ kind: 'signed-in', session: { userId: USER_ID } })
  await useAuthStore().signUp('milo@example.test', 'motdepasse-solide')
  await nextTick()
}

async function letSyncRun(): Promise<void> {
  await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 1)
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  addNetworkListener.mockImplementation(async () => ({ remove: async () => {} }))
  setActivePinia(createPinia())
  billing.logIn.mockResolvedValue(NO_PLUS)
  billing.purchase.mockResolvedValue({ kind: 'purchased', status: ANNUAL })
  server = createFakeSyncServer()
  db = await createInMemoryDb()
  phone = await createPlusPhone(db, server, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
    userId: () => useAuthStore().userId,
    isEligible: isPlusEligible,
  })
  await phone.animals.create({ name: 'Milo', species: 'dog' })
  vi.useFakeTimers({ now: new Date(2026, 9, 29, 9) })
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  db.close()
})

describe('achat de Plus sans compte, le 29 octobre, carnet de Milo sur le téléphone', () => {
  it('compte d’abord, puis paiement, puis « Envoyer le carnet… » : Milo monte après « Envoyer » seulement', async () => {
    flow = await launch()
    const checkout = phoneCheckout()

    await expect(checkout.checkout('annual')).resolves.toEqual({ kind: 'needs-account' })
    expect(billing.purchase).not.toHaveBeenCalled()

    await createAccount()
    await letSyncRun()
    expect(flow.state.value).toMatchObject({
      step: 'send-confirmation',
      animalCount: 1,
      firstName: 'Milo',
    })

    const resumed = checkout.resume()
    expect(resumed).toEqual({ plan: 'annual', pay: true })
    await expect(checkout.checkout(resumed!.plan)).resolves.toEqual({
      kind: 'purchased',
      status: ANNUAL,
    })
    expect(billing.logIn).toHaveBeenCalledWith(USER_ID)
    expect(usePurchaseStore().status).toEqual(ANNUAL)

    await letSyncRun()
    expect(server.rows('animal')).toEqual([])
    expect(flow.state.value.step).toBe('send-confirmation')

    flow.confirmSend()
    await letSyncRun()
    await letSyncRun()

    expect(server.rows('animal').map(({ name }) => name)).toEqual(['Milo'])
    await expect(phone.outbox.listPending()).resolves.toEqual([])
  })

  it('« Envoyer » touché avant la fin du paiement : rien ne part tant que Plus n’est pas actif', async () => {
    flow = await launch()
    const checkout = phoneCheckout()
    await checkout.checkout('annual')
    await createAccount()
    await letSyncRun()

    flow.confirmSend()
    await letSyncRun()

    await expect(phone.outbox.isEnabled()).resolves.toBe(true)
    expect(server.rows('animal')).toEqual([])
  })

  it.fails(
    'défaut : « Envoyer » touché avant la fin du paiement, Milo ne monte pas à l’activation de Plus sans autre geste',
    async () => {
      flow = await launch()
      const checkout = phoneCheckout()
      await checkout.checkout('annual')
      await createAccount()
      await letSyncRun()
      flow.confirmSend()
      await letSyncRun()

      await checkout.checkout(checkout.resume()!.plan)
      await letSyncRun()

      expect(server.rows('animal').map(({ name }) => name)).toEqual(['Milo'])
    },
  )
})
