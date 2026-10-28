import type { PluginListenerHandle } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { SYNC_DEBOUNCE_MS } from '@/core/sync/service/sync-scheduler'
import { memoryStorage, USER_ID } from '@/features/auth/__tests__/auth-fixture'
import { authRepository, type AuthRepository } from '@/features/auth/repository/auth.repository'
import { provideAuthRepository, useAuthStore } from '@/features/auth/store/auth.store'
import { NO_PLUS, type PlusStatus } from '@/features/purchase/logic/plus-status'
import { plusStatusLabel } from '@/features/purchase/logic/plus-status-label'
import { billingService, type BillingService } from '@/features/purchase/service/billing.service'
import { installPlusStatusRefresh } from '@/features/purchase/service/plus-status-refresh.service'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
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

function at(hour: number, minute = 0, day = 29): Date {
  return new Date(2026, 9, day, hour, minute)
}

function monthlyUntil(end: Date): PlusStatus {
  return { plan: 'monthly', expiresAt: end.toISOString() }
}

let server: FakeSyncServer
let db: InMemoryDb
let phone: PlusPhone
let networkListeners: NetworkListener[]
const stops: Array<() => void> = []

async function launch(): Promise<void> {
  const app = await launchPlusApp(phone)
  stops.push(app.stop)
}

async function signIn(): Promise<void> {
  repository.signIn.mockResolvedValueOnce({ userId: USER_ID })
  await useAuthStore().signIn('milo@example.test', 'motdepasse-solide')
  await nextTick()
}

async function letSyncRun(): Promise<void> {
  await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 1)
}

async function backUpMilo(): Promise<string> {
  const milo = await phone.animals.create({ name: 'Milo', species: 'dog' })
  await phone.backup.check()
  await phone.backup.confirmSend()
  await phone.runCycle()
  return milo.id
}

function networkBack(): void {
  for (const listener of networkListeners) listener({ connected: true, connectionType: 'wifi' })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  networkListeners = []
  addNetworkListener.mockImplementation(async (_, listener) => {
    networkListeners.push(listener)
    return { remove: async () => {} }
  })
  setActivePinia(createPinia())
  billing.logIn.mockResolvedValue(NO_PLUS)
  billing.fetchStatus.mockReset()
  server = createFakeSyncServer()
  db = await createInMemoryDb()
  phone = await createPlusPhone(db, server, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
    userId: () => useAuthStore().userId,
    isEligible: isPlusEligible,
  })
  vi.useFakeTimers({ now: at(9) })
})

afterEach(() => {
  while (stops.length > 0) stops.pop()!()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  db.close()
})

describe('abonnement mensuel de test acheté le 29 octobre à 9 h, renouvelé puis expiré à 9 h 30', () => {
  beforeEach(async () => {
    await signIn()
    billing.purchase.mockResolvedValueOnce({ kind: 'purchased', status: monthlyUntil(at(9, 5)) })
    await usePurchaseStore().purchase('monthly')
  })

  it('« En pause » le 29 octobre, sauvegarde gardée jusqu’au 29 octobre 2027, synchro arrêtée, carnet intact ; rachat le 30 sans doublon', async () => {
    const miloId = await backUpMilo()
    const purchase = usePurchaseStore()
    expect(server.rows('animal').map(({ name }) => name)).toEqual(['Milo'])
    const pulledBefore = await phone.outbox.getLastPulledAt('animal')

    vi.setSystemTime(at(9, 29))
    billing.fetchStatus.mockResolvedValueOnce(monthlyUntil(at(9, 30)))
    await purchase.verifyKnownStatus()
    expect(purchase.status).toEqual(monthlyUntil(at(9, 30)))

    vi.setSystemTime(at(9, 31))
    billing.fetchStatus.mockResolvedValueOnce(NO_PLUS)
    await purchase.verifyKnownStatus()

    expect(purchase.status).toEqual(NO_PLUS)
    expect(purchase.expiredPlan).toBe('monthly')
    expect(purchase.backupPause).toEqual({ keptUntil: '2027-10-29' })
    expect(plusStatusLabel(purchase.status, purchase.expiredPlan)).toEqual({
      key: 'plus.settings.status.expiredMonthly',
      expiresAt: null,
    })

    vi.setSystemTime(at(10))
    await phone.weight.create({ animalId: miloId, weightKg: 9.8, measuredOn: '2026-10-29' })
    await phone.runCycle()

    expect(server.rows('weight_entry')).toEqual([])
    expect((await phone.weight.listByAnimal(miloId)).map(({ weightKg }) => weightKg)).toEqual([9.8])
    expect(await phone.animals.list()).toHaveLength(1)
    await expect(phone.outbox.listPending()).resolves.toHaveLength(1)

    vi.setSystemTime(at(9, 0, 30))
    billing.purchase.mockResolvedValueOnce({
      kind: 'purchased',
      status: monthlyUntil(at(9, 5, 30)),
    })
    await purchase.purchase('monthly')
    expect(purchase.status.plan).toBe('monthly')
    expect(purchase.backupPause).toBeNull()

    await phone.runCycle()
    await phone.runCycle()

    expect(server.rows('animal')).toHaveLength(1)
    expect(server.rows('weight_entry').map(({ weight_kg }) => weight_kg)).toEqual([9.8])
    expect(await phone.animals.list()).toHaveLength(1)
    expect(await phone.weight.listByAnimal(miloId)).toHaveLength(1)
    await expect(phone.outbox.listPending()).resolves.toEqual([])
    expect(await phone.outbox.getLastPulledAt('animal')).toBe(pulledBefore)
  })
})

describe('hors ligne au moment de l’expiration, le 29 octobre à 9 h 30 (décision #1350)', () => {
  beforeEach(async () => {
    await signIn()
    billing.purchase.mockResolvedValueOnce({ kind: 'purchased', status: monthlyUntil(at(9, 30)) })
    await usePurchaseStore().purchase('monthly')
  })

  it('l’app reste utilisable, l’écran lit « expiré », puis le renouvellement est relu au retour au premier plan en ligne et la pesée part', async () => {
    const miloId = await backUpMilo()
    billing.fetchStatus.mockResolvedValue(monthlyUntil(at(9, 30)))
    await launch()
    stops.push(installPlusStatusRefresh())
    await letSyncRun()
    const purchase = usePurchaseStore()

    vi.setSystemTime(at(9, 31))
    billing.fetchStatus.mockRejectedValue(new Error('hors ligne'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    simulateWebResume()
    await letSyncRun()

    expect(purchase.status).toEqual(NO_PLUS)
    expect(purchase.expiredPlan).toBe('monthly')
    await phone.weight.create({ animalId: miloId, weightKg: 9.8, measuredOn: '2026-10-29' })
    await letSyncRun()
    expect(server.rows('weight_entry')).toEqual([])

    vi.setSystemTime(at(11))
    billing.fetchStatus.mockResolvedValue(monthlyUntil(at(9, 30, 30)))
    simulateWebResume()
    await letSyncRun()

    expect(purchase.status.plan).toBe('monthly')
    expect(purchase.expiredPlan).toBeNull()
    expect(server.rows('weight_entry').map(({ weight_kg }) => weight_kg)).toEqual([9.8])
  })

  it.fails(
    'défaut : au retour du réseau, app restée au premier plan, le renouvellement n’est pas relu et la pesée ne part pas',
    async () => {
      const miloId = await backUpMilo()
      billing.fetchStatus.mockResolvedValue(monthlyUntil(at(9, 30)))
      await launch()
      stops.push(installPlusStatusRefresh())
      await letSyncRun()

      vi.setSystemTime(at(9, 31))
      billing.fetchStatus.mockRejectedValue(new Error('hors ligne'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      simulateWebResume()
      await letSyncRun()
      await phone.weight.create({ animalId: miloId, weightKg: 9.8, measuredOn: '2026-10-29' })

      vi.setSystemTime(at(11))
      billing.fetchStatus.mockResolvedValue(monthlyUntil(at(9, 30, 30)))
      networkBack()

      await letSyncRun()

      expect(usePurchaseStore().status.plan).toBe('monthly')
      expect(server.rows('weight_entry').map(({ weight_kg }) => weight_kg)).toEqual([9.8])
    },
  )
})
