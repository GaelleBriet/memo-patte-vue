// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/core/i18n/locales/en.json'
import fr from '@/core/i18n/locales/fr.json'
import { memoryStorage, USER_ID } from '@/features/auth/__tests__/auth-fixture'
import { authRepository, type AuthRepository } from '@/features/auth/repository/auth.repository'
import { provideAuthRepository, useAuthStore } from '@/features/auth/store/auth.store'
import { readPlusEndedAt } from '@/features/purchase/logic/plus-pause-storage'
import { NO_PLUS, type PlusStatus } from '@/features/purchase/logic/plus-status'
import { billingService, type BillingService } from '@/features/purchase/service/billing.service'
import { installPlusAccountLink } from '@/features/purchase/service/plus-account-link.service'
import { installPlusStatusRefresh } from '@/features/purchase/service/plus-status-refresh.service'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'

vi.mock('@/core/app-lifecycle/app-resume', () => ({ onAppResume: () => () => {} }))

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

const repository = vi.mocked(authRepository)
provideAuthRepository(() => authRepository)
const billing = vi.mocked(billingService)

const MONTHLY: PlusStatus = { plan: 'monthly', expiresAt: '2026-11-29T08:00:00.000Z' }

const stops: Array<() => void> = []

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 29, 9) })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  billing.logIn.mockReset().mockResolvedValue(MONTHLY)
  billing.logOut.mockReset().mockResolvedValue()
  billing.fetchStatus.mockReset().mockResolvedValue(MONTHLY)
})

afterEach(() => {
  while (stops.length > 0) stops.pop()!()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('compte supprimé le 29 octobre, abonnement mensuel Google Play en cours jusqu’au 29 novembre', () => {
  it('l’app redevient gratuite et le reste au lancement suivant, sans « En pause » ni appel à Google Play', async () => {
    stops.push(installPlusAccountLink(() => useAuthStore().userId))
    repository.signIn.mockResolvedValueOnce({ userId: USER_ID })
    await useAuthStore().signIn('milo@example.test', 'motdepasse-solide')
    await nextTick()
    await vi.waitFor(() => expect(usePurchaseStore().status).toEqual(MONTHLY))

    await useAuthStore().forgetDeletedAccount()
    await nextTick()

    const purchase = usePurchaseStore()
    expect(billing.logOut).toHaveBeenCalledOnce()
    expect(purchase.status).toEqual(NO_PLUS)
    expect(purchase.expiredPlan).toBeNull()
    expect(purchase.backupPause).toBeNull()

    vi.setSystemTime(new Date(2026, 9, 30, 9))
    setActivePinia(createPinia())
    stops.push(installPlusStatusRefresh())
    await nextTick()

    expect(billing.fetchStatus).not.toHaveBeenCalled()
    expect(usePurchaseStore().status).toEqual(NO_PLUS)
    expect(usePurchaseStore().expiredPlan).toBeNull()
    expect(usePurchaseStore().backupPause).toBeNull()
    expect(readPlusEndedAt()).toBeNull()
  })

  it.each([
    [
      'fr',
      fr,
      'ne résilie pas ton abonnement Google Play',
      'continue tant que tu ne le résilies pas',
    ],
    ['en', en, 'doesn’t cancel your Google Play subscription', 'continues until you cancel it'],
  ])(
    'en %s, les deux écrans de suppression disent que l’abonnement se gère dans Google Play',
    (_, messages, summary, finalConfirm) => {
      const deletion = messages.settings.account.delete
      expect(deletion.subscription).toContain(summary)
      expect(deletion.finalConfirm.subscription).toContain(finalConfirm)
    },
  )
})
