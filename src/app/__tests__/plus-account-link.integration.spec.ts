// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { authRepository, type AuthRepository } from '@/features/auth/auth.repository'
import { useAuthStore } from '@/features/auth/auth.store'
import { memoryStorage, OTHER_USER_ID, USER_ID } from '@/features/auth/__tests__/auth-fixture'
import { billingService, type BillingService } from '@/features/purchase/billing.service'
import { installPlusAccountLink } from '@/features/purchase/plus-account-link.service'
import { NO_PLUS, type PlusStatus } from '@/features/purchase/plus-status'
import {
  NO_STORED_PLUS,
  readStoredPlusStatus,
  writeStoredPlusStatus,
} from '@/features/purchase/plus-status-storage'
import { usePurchaseStore } from '@/features/purchase/purchase.store'

vi.mock('@/features/auth/auth.repository', () => ({
  authRepository: {
    signUp: vi.fn<AuthRepository['signUp']>(),
    signIn: vi.fn<AuthRepository['signIn']>(),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
    restoreSession: vi.fn<AuthRepository['restoreSession']>(),
    refreshSession: vi.fn<AuthRepository['refreshSession']>(),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
  },
}))

vi.mock('@/features/purchase/billing.service', async (importOriginal) => ({
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
const billing = vi.mocked(billingService)

const ANNUAL: PlusStatus = { plan: 'annual', expiresAt: '2027-09-01T10:00:00Z' }
const LAPSED_AT = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

let stop: () => void = () => {}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  billing.logIn.mockResolvedValue(NO_PLUS)
  billing.logOut.mockResolvedValue()
})

afterEach(() => {
  stop()
  vi.unstubAllGlobals()
})

async function signedIn(userId: string) {
  repository.signIn.mockResolvedValueOnce({ userId })
  await useAuthStore().signIn('quelquun@example.test', 'motdepasse')
  await nextTick()
}

function install(): void {
  stop = installPlusAccountLink(() => useAuthStore().userId)
}

describe('l’achat suit le compte connecté', () => {
  it('rattache l’achat à l’identifiant du compte, jamais à son e-mail', async () => {
    install()

    await signedIn(USER_ID)

    expect(billing.logIn).toHaveBeenCalledExactlyOnceWith(USER_ID)
  })

  it('garde l’abonnement échu de l’appareil à la première connexion', async () => {
    writeStoredPlusStatus({ plan: 'annual', expiresAt: LAPSED_AT })
    const purchase = usePurchaseStore()
    install()

    await signedIn(USER_ID)

    expect(billing.logIn).toHaveBeenCalledExactlyOnceWith(USER_ID)
    expect(purchase.expiredPlan).toBe('annual')
    expect(readStoredPlusStatus().lastSubscription).toBe('annual')
  })

  it('remet la mémoire du store d’accord avec le stockage au changement de compte', async () => {
    billing.logIn.mockResolvedValueOnce(ANNUAL)
    const purchase = usePurchaseStore()
    install()
    await signedIn(USER_ID)
    expect(purchase.status).toEqual(ANNUAL)

    await signedIn(OTHER_USER_ID)

    expect(billing.logIn).toHaveBeenLastCalledWith(OTHER_USER_ID)
    expect(purchase.status).toEqual(NO_PLUS)
    expect(purchase.expiredPlan).toBeNull()
    expect(readStoredPlusStatus()).toEqual(NO_STORED_PLUS)
  })

  it('ne lègue rien au compte suivant quand le store ne répond pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    billing.logIn.mockResolvedValueOnce(ANNUAL)
    const purchase = usePurchaseStore()
    install()
    await signedIn(USER_ID)
    billing.logIn.mockRejectedValueOnce(new Error('réseau'))

    await signedIn(OTHER_USER_ID)

    expect(purchase.status).toEqual(NO_PLUS)
    expect(readStoredPlusStatus()).toEqual(NO_STORED_PLUS)
  })

  it('détache l’achat à la déconnexion quand aucun droit payant n’est connu', async () => {
    install()
    await signedIn(USER_ID)

    await useAuthStore().signOut()
    await nextTick()

    expect(billing.logOut).toHaveBeenCalledOnce()
  })

  it('garde l’abonnement de l’appareil à la déconnexion, sans repartir d’un anonyme', async () => {
    billing.logIn.mockResolvedValueOnce(ANNUAL)
    const purchase = usePurchaseStore()
    install()
    await signedIn(USER_ID)

    await useAuthStore().signOut()
    await nextTick()

    expect(billing.logOut).not.toHaveBeenCalled()
    expect(purchase.status).toEqual(ANNUAL)
  })

  it('ne fait échouer ni la connexion ni la déconnexion quand le store ne répond pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    billing.logIn.mockRejectedValue(new Error('réseau'))
    billing.logOut.mockRejectedValue(new Error('réseau'))
    install()

    await expect(signedIn(USER_ID)).resolves.toBeUndefined()
    await expect(useAuthStore().signOut()).resolves.toBeUndefined()
  })

  it('ne contacte pas le store quand les achats sont indisponibles', async () => {
    billing.isAvailable.mockReturnValue(false)
    install()

    await signedIn(USER_ID)
    await useAuthStore().signOut()
    await nextTick()

    expect(billing.logIn).not.toHaveBeenCalled()
    expect(billing.logOut).not.toHaveBeenCalled()
  })
})
