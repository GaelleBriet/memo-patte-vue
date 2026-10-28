import type { PluginListenerHandle } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { createBackupFactsReader } from '@/core/sync/service/backup-facts'
import { SYNC_DEBOUNCE_MS } from '@/core/sync/service/sync-scheduler'
import { memoryStorage, USER_ID } from '@/features/auth/__tests__/auth-fixture'
import { authRepository, type AuthRepository } from '@/features/auth/repository/auth.repository'
import { provideAuthRepository, useAuthStore } from '@/features/auth/store/auth.store'
import { NO_PLUS, type PlusStatus } from '@/features/purchase/logic/plus-status'
import { billingService, type BillingService } from '@/features/purchase/service/billing.service'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { backupStatusOf } from '@/features/settings/logic/backup-status'
import { createPlusPhone, isPlusEligible, launchPlusApp, type PlusPhone } from './plus-phone'

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
let db: InMemoryDb
let phone: PlusPhone
let stop: () => void = () => {}
let sessionUnreadable: () => void = () => {}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  addNetworkListener.mockImplementation(async () => ({ remove: async () => {} }))
  repository.onSessionUnreadable.mockImplementation((listener) => {
    sessionUnreadable = listener
  })
  setActivePinia(createPinia())
  billing.logIn.mockReset().mockResolvedValue(NO_PLUS)
  billing.purchase.mockReset().mockResolvedValue({ kind: 'purchased', status: ANNUAL })
  server = createFakeSyncServer()
  db = await createInMemoryDb()
  phone = await createPlusPhone(db, server, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
    userId: () => useAuthStore().userId,
    isEligible: isPlusEligible,
  })
  vi.useFakeTimers({ now: new Date(2026, 9, 29, 9) })
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  db.close()
})

describe('coffre Keystore illisible le 29 octobre, après l’achat de Plus annuel du matin', () => {
  it('Plus reste celui de l’appareil, la sauvegarde dit « Reconnecte-toi », rien n’est restauré ni recontrôlé', async () => {
    const auth = useAuthStore()
    repository.signIn.mockResolvedValueOnce({ userId: USER_ID })
    await auth.signIn('milo@example.test', 'motdepasse-solide')
    await nextTick()
    await usePurchaseStore().purchase('annual')
    const milo = await phone.animals.create({ name: 'Milo', species: 'dog' })
    await phone.backup.check()
    await phone.backup.confirmSend()
    await phone.runCycle()
    const check = vi.spyOn(phone.backup, 'check')
    const app = await launchPlusApp(phone)
    stop = app.stop
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 1)
    const lastSyncedAt = await phone.outbox.getLastSyncedAt()
    expect(lastSyncedAt).not.toBeNull()
    const stepBefore = app.flow.state.value.step
    const checks = check.mock.calls.length

    vi.setSystemTime(new Date(2026, 9, 29, 14))
    sessionUnreadable()
    await nextTick()

    expect(auth.sessionState).toBe('needs-sign-in')
    expect(auth.sessionUnreadable).toBe(true)
    expect(usePurchaseStore().status).toEqual(ANNUAL)
    expect(billing.logOut).not.toHaveBeenCalled()
    const facts = await createBackupFactsReader({
      outbox: phone.outbox,
      isEligible: isPlusEligible,
      signInNeeded: () => auth.sessionState === 'needs-sign-in',
      sessionReset: () => auth.sessionUnreadable,
      isOnline: async () => true,
    })()
    expect(backupStatusOf(facts)).toEqual({
      kind: 'interrupted',
      since: lastSyncedAt,
      sessionReset: true,
    })

    await phone.weight.create({ animalId: milo.id, weightKg: 9.8, measuredOn: '2026-10-29' })
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 1)
    expect(app.flow.state.value.step).toBe(stepBefore)
    expect(check).toHaveBeenCalledTimes(checks)
    expect((await phone.animals.list()).map(({ name }) => name)).toEqual(['Milo'])
    await expect(phone.outbox.isEnabled()).resolves.toBe(true)
    expect(await phone.weight.listByAnimal(milo.id)).toHaveLength(1)
  })
})
