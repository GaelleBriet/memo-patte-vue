import { Capacitor } from '@capacitor/core'
import type {
  CustomerInfo,
  PURCHASES_ERROR_CODE,
  PurchasesPackage,
  PurchasesPlugin,
} from '@revenuecat/purchases-capacitor'

import { plusStatusFrom, type PlusPlan, type PlusStatus } from './plus-status'

export type PaidPlan = Exclude<PlusPlan, 'none'>

export type PlusOffer = {
  plan: PaidPlan
  priceString: string
}

export type PurchaseOutcome = { kind: 'purchased'; status: PlusStatus } | { kind: 'cancelled' }

export type BillingErrorReason = 'unavailable' | 'failed'

export class BillingError extends Error {
  override readonly name = 'BillingError'

  constructor(
    readonly reason: BillingErrorReason,
    options?: { cause?: unknown },
  ) {
    super(reason === 'unavailable' ? 'Achats indisponibles' : 'Échec du store', options)
  }
}

export type BillingService = {
  isAvailable(): boolean
  listOffers(): Promise<PlusOffer[]>
  purchase(plan: PaidPlan): Promise<PurchaseOutcome>
  fetchStatus(): Promise<PlusStatus>
  restore(): Promise<PlusStatus>
  /** `appUserID` : l'UUID du compte Supabase, jamais l'email. */
  logIn(appUserID: string): Promise<PlusStatus>
}

export type BillingDependencies = {
  apiKey: string | undefined
  isNativePlatform: () => boolean
  loadPlugin?: () => Promise<PurchasesPlugin>
}

const PACKAGE_PLANS: ReadonlyArray<readonly [string, PaidPlan]> = [
  ['$rc_monthly', 'monthly'],
  ['$rc_annual', 'annual'],
  ['$rc_lifetime', 'lifetime'],
]

const PURCHASE_CANCELLED_CODE: `${PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR}` = '1'

async function loadRevenueCat(): Promise<PurchasesPlugin> {
  return (await import('@revenuecat/purchases-capacitor')).Purchases
}

function isUserCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, userCancelled, data } = error as {
    code?: unknown
    userCancelled?: unknown
    data?: { userCancelled?: unknown }
  }
  return code === PURCHASE_CANCELLED_CODE || userCancelled === true || data?.userCancelled === true
}

export function createBillingService({
  apiKey,
  isNativePlatform,
  loadPlugin = loadRevenueCat,
}: BillingDependencies): BillingService {
  let configured: Promise<PurchasesPlugin> | null = null

  function isAvailable(): boolean {
    return Boolean(apiKey) && isNativePlatform()
  }

  function ready(): Promise<PurchasesPlugin> {
    if (!isAvailable()) return Promise.reject(new BillingError('unavailable'))
    configured ??= loadPlugin()
      .then(async (plugin) => {
        await plugin.configure({
          apiKey: apiKey!,
          automaticDeviceIdentifierCollectionEnabled: false,
        })
        return plugin
      })
      .catch((cause: unknown) => {
        configured = null
        throw cause
      })
    return configured
  }

  async function withPlugin<T>(operation: (plugin: PurchasesPlugin) => Promise<T>): Promise<T> {
    try {
      return await operation(await ready())
    } catch (cause) {
      if (cause instanceof BillingError) throw cause
      throw new BillingError('failed', { cause })
    }
  }

  async function statusOf(request: Promise<{ customerInfo: CustomerInfo }>): Promise<PlusStatus> {
    return plusStatusFrom((await request).customerInfo)
  }

  async function currentPackages(
    plugin: PurchasesPlugin,
  ): Promise<Map<PaidPlan, PurchasesPackage>> {
    const { current } = await plugin.getOfferings()
    const packages = new Map<PaidPlan, PurchasesPackage>()
    for (const [identifier, plan] of PACKAGE_PLANS) {
      const found = current?.availablePackages.find((pkg) => pkg.identifier === identifier)
      if (found) packages.set(plan, found)
    }
    return packages
  }

  return {
    isAvailable,

    async listOffers() {
      if (!isAvailable()) return []
      const packages = await withPlugin(currentPackages)
      return [...packages].map(([plan, pkg]) => ({ plan, priceString: pkg.product.priceString }))
    },

    purchase(plan) {
      return withPlugin(async (plugin) => {
        const aPackage = (await currentPackages(plugin)).get(plan)
        if (!aPackage) throw new BillingError('unavailable')
        try {
          const { customerInfo } = await plugin.purchasePackage({ aPackage })
          return { kind: 'purchased', status: plusStatusFrom(customerInfo) }
        } catch (cause) {
          if (isUserCancellation(cause)) return { kind: 'cancelled' }
          throw cause
        }
      })
    },

    fetchStatus: () => withPlugin((plugin) => statusOf(plugin.getCustomerInfo())),

    restore: () => withPlugin((plugin) => statusOf(plugin.restorePurchases())),

    logIn: (appUserID) => withPlugin((plugin) => statusOf(plugin.logIn({ appUserID }))),
  }
}

export const billingService = createBillingService({
  apiKey: import.meta.env.VITE_REVENUECAT_GOOGLE_KEY,
  isNativePlatform: () => Capacitor.isNativePlatform(),
})
