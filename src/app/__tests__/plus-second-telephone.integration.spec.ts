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
    signIn: vi.fn<AuthRepository['signIn']>(),
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

const ANNUAL: PlusStatus = { plan: 'annual', expiresAt: '2027-10-29T08:00:00.000Z' }

let server: FakeSyncServer
let dbs: InMemoryDb[]
let firstPhone: PlusPhone
let secondPhone: PlusPhone
let stop: () => void = () => {}

async function letSyncRun(): Promise<void> {
  await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 1)
}

async function weightsOf(phone: PlusPhone, animalId: string): Promise<number[]> {
  return (await phone.weight.listByAnimal(animalId)).map(({ weightKg }) => weightKg)
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  addNetworkListener.mockImplementation(async () => ({ remove: async () => {} }))
  setActivePinia(createPinia())
  billing.logIn.mockReset().mockResolvedValue(NO_PLUS)
  billing.restore.mockReset().mockResolvedValue(ANNUAL)
  server = createFakeSyncServer()
  dbs = [await createInMemoryDb(), await createInMemoryDb()]
  firstPhone = await createPlusPhone(dbs[0]!, server, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
    userId: () => USER_ID,
    isEligible: () => true,
  })
  secondPhone = await createPlusPhone(dbs[1]!, server, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
    userId: () => useAuthStore().userId,
    isEligible: isPlusEligible,
  })
  vi.useFakeTimers({ now: new Date(2026, 9, 29, 9) })
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const db of dbs) db.close()
})

describe('« Restaurer mes achats » sur un second téléphone, même compte Google, le 29 octobre', () => {
  it('Plus reconnu, carnet de Milo restauré sans doublon, puis la modification la plus récente l’emporte', async () => {
    const milo = await firstPhone.animals.create({ name: 'Milo', species: 'dog' })
    await firstPhone.weight.create({ animalId: milo.id, weightKg: 9.8, measuredOn: '2026-10-28' })
    await firstPhone.backup.check()
    await firstPhone.backup.confirmSend()
    await firstPhone.runCycle()

    vi.setSystemTime(new Date(2026, 9, 29, 10))
    const app = await launchPlusApp(secondPhone)
    stop = app.stop
    const flow: RestoreFlow = app.flow
    const checkout = phoneCheckout()

    await expect(checkout.restorePurchases()).resolves.toEqual({ kind: 'needs-account' })
    expect(billing.restore).not.toHaveBeenCalled()

    repository.signIn.mockResolvedValueOnce({ userId: USER_ID })
    await useAuthStore().signIn('milo@example.test', 'motdepasse-solide')
    await nextTick()
    expect(checkout.resumeRestore()).toBe(true)
    await expect(checkout.restorePurchases()).resolves.toEqual({
      kind: 'restored',
      status: ANNUAL,
    })
    expect(billing.logIn).toHaveBeenCalledWith(USER_ID)
    expect(usePurchaseStore().status).toEqual(ANNUAL)

    await letSyncRun()
    await letSyncRun()

    expect(flow.state.value.step).toBe('done')
    expect((await secondPhone.animals.list()).map(({ name }) => name)).toEqual(['Milo'])
    expect(await weightsOf(secondPhone, milo.id)).toEqual([9.8])
    expect(server.rows('animal')).toHaveLength(1)
    expect(server.rows('weight_entry')).toHaveLength(1)

    vi.setSystemTime(new Date(2026, 9, 29, 11))
    const [pesee] = await secondPhone.weight.listByAnimal(milo.id)
    await secondPhone.weight.update(pesee!.id, { weightKg: 10.1, measuredOn: '2026-10-28' })
    await secondPhone.runCycle()
    await firstPhone.runCycle()

    expect(await weightsOf(firstPhone, milo.id)).toEqual([10.1])
    expect(server.rows('weight_entry').map(({ weight_kg }) => weight_kg)).toEqual([10.1])
    expect(await firstPhone.animals.list()).toHaveLength(1)
  })
})
