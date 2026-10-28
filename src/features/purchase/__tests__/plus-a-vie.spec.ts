// @vitest-environment node
import { Purchases, type PurchasesPlugin } from '@revenuecat/purchases-capacitor'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as BillingModule from '../service/billing.service'
import { plusStatusLabel } from '../logic/plus-status-label'
import { readPlusEndedAt } from '../logic/plus-pause-storage'
import { writeStoredPlusStatus } from '../logic/plus-status-storage'
import { usePurchaseStore } from '../store/purchase.store'
import {
  ANNUAL_PACKAGE,
  customerInfo,
  entitlement,
  LIFETIME,
  LIFETIME_PACKAGE,
  memoryStorage,
  MONTHLY_PACKAGE,
  offerings,
} from './billing-fixture'

vi.mock('@/core/analytics', () => ({
  track: vi.fn<(event: string, properties?: Record<string, unknown>) => void>(),
}))

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure: vi.fn<PurchasesPlugin['configure']>(),
    getOfferings: vi.fn<PurchasesPlugin['getOfferings']>(),
    purchasePackage: vi.fn<PurchasesPlugin['purchasePackage']>(),
    getCustomerInfo: vi.fn<PurchasesPlugin['getCustomerInfo']>(),
    restorePurchases: vi.fn<PurchasesPlugin['restorePurchases']>(),
    logIn: vi.fn<PurchasesPlugin['logIn']>(),
    logOut: vi.fn<PurchasesPlugin['logOut']>(),
  },
}))

vi.mock('../service/billing.service', async (importOriginal) => {
  const original = await importOriginal<typeof BillingModule>()
  return {
    ...original,
    billingService: original.createBillingService({
      apiKey: 'goog_test',
      isNativePlatform: () => true,
    }),
  }
})

const plugin = vi.mocked(Purchases)

const LIFETIME_CUSTOMER = customerInfo(
  entitlement({ ...LIFETIME, latestPurchaseDate: '2026-10-29T08:00:00Z' }),
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 29, 9) })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  plugin.configure.mockResolvedValue()
  plugin.getOfferings.mockResolvedValue(
    offerings([LIFETIME_PACKAGE, ANNUAL_PACKAGE, MONTHLY_PACKAGE]),
  )
  plugin.purchasePackage.mockResolvedValue({
    productIdentifier: 'memopatte_plus_lifetime',
    customerInfo: LIFETIME_CUSTOMER,
    transaction: {} as never,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function expectLifetimeWithoutEnd(): void {
  const purchase = usePurchaseStore()
  expect(purchase.status).toEqual({ plan: 'lifetime', expiresAt: null })
  expect(purchase.expiredPlan).toBeNull()
  expect(purchase.backupPause).toBeNull()
  expect(plusStatusLabel(purchase.status, purchase.expiredPlan)).toEqual({
    key: 'plus.settings.status.lifetime',
    expiresAt: null,
  })
}

describe('Plus à vie acheté le 29 octobre 2026, après un mensuel arrêté le 20 octobre', () => {
  beforeEach(() => {
    writeStoredPlusStatus({
      plan: 'none',
      expiresAt: null,
      lastSubscription: 'monthly',
      subscriptionEndedAt: new Date(2026, 9, 20, 12).toISOString(),
    })
  })

  it('l’« En pause » du mensuel disparaît, et aucune date de fin ne s’affiche', async () => {
    expect(usePurchaseStore().backupPause).toEqual({ keptUntil: '2027-10-20' })

    await usePurchaseStore().purchase('lifetime')

    expectLifetimeWithoutEnd()
    expect(readPlusEndedAt()).toBeNull()
  })

  it('dix ans plus tard, hors ligne puis en ligne, puis après un redémarrage : toujours à vie, jamais « En pause »', async () => {
    await usePurchaseStore().purchase('lifetime')

    vi.setSystemTime(new Date(2036, 9, 29, 9))
    plugin.getCustomerInfo.mockRejectedValueOnce(new Error('hors ligne'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(usePurchaseStore().verifyKnownStatus()).resolves.toBe(false)
    expectLifetimeWithoutEnd()

    plugin.getCustomerInfo.mockResolvedValueOnce({ customerInfo: LIFETIME_CUSTOMER })
    await expect(usePurchaseStore().verifyKnownStatus()).resolves.toBe(true)
    expectLifetimeWithoutEnd()

    setActivePinia(createPinia())
    expectLifetimeWithoutEnd()
    expect(readPlusEndedAt()).toBeNull()
  })
})
