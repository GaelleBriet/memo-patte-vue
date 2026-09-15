import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from '@revenuecat/purchases-capacitor'

export function entitlement(
  overrides: Partial<PurchasesEntitlementInfo> = {},
): PurchasesEntitlementInfo {
  return {
    identifier: 'plus',
    isActive: true,
    willRenew: true,
    periodType: 'NORMAL',
    latestPurchaseDate: '2026-09-01T10:00:00Z',
    latestPurchaseDateMillis: Date.parse('2026-09-01T10:00:00Z'),
    originalPurchaseDate: '2026-09-01T10:00:00Z',
    originalPurchaseDateMillis: Date.parse('2026-09-01T10:00:00Z'),
    expirationDate: '2027-09-01T10:00:00Z',
    expirationDateMillis: Date.parse('2027-09-01T10:00:00Z'),
    store: 'PLAY_STORE',
    productIdentifier: 'memopatte_plus',
    productPlanIdentifier: 'annual',
    isSandbox: true,
    unsubscribeDetectedAt: null,
    unsubscribeDetectedAtMillis: null,
    billingIssueDetectedAt: null,
    billingIssueDetectedAtMillis: null,
    ownershipType: 'PURCHASED',
    verification: 'NOT_REQUESTED' as PurchasesEntitlementInfo['verification'],
    ...overrides,
  }
}

export const LIFETIME = {
  productIdentifier: 'memopatte_plus_lifetime',
  productPlanIdentifier: null,
  expirationDate: null,
  expirationDateMillis: null,
  willRenew: false,
}

export function customerInfo(
  active: PurchasesEntitlementInfo | null,
  expired: PurchasesEntitlementInfo | null = null,
): CustomerInfo {
  const plus = active ?? expired
  return {
    entitlements: {
      all: plus ? { plus } : {},
      active: active ? { plus: active } : {},
      verification: 'NOT_REQUESTED' as CustomerInfo['entitlements']['verification'],
    },
    activeSubscriptions: [],
    allPurchasedProductIdentifiers: [],
    latestExpirationDate: null,
    firstSeen: '2026-09-01T10:00:00Z',
    originalAppUserId: '$RCAnonymousID:test',
    requestDate: '2026-09-15T10:00:00Z',
    allExpirationDates: {},
    allPurchaseDates: {},
    originalApplicationVersion: null,
    originalPurchaseDate: null,
    managementURL: null,
    nonSubscriptionTransactions: [],
    subscriptionsByProductIdentifier: {},
  }
}

function pkg(identifier: string, priceString: string): PurchasesPackage {
  return {
    identifier,
    packageType: 'CUSTOM' as PurchasesPackage['packageType'],
    product: { identifier, priceString } as PurchasesPackage['product'],
    offeringIdentifier: 'default',
    presentedOfferingContext: {
      offeringIdentifier: 'default',
    } as PurchasesPackage['presentedOfferingContext'],
    webCheckoutUrl: null,
  }
}

export const MONTHLY_PACKAGE = pkg('$rc_monthly', '1,49 €')
export const ANNUAL_PACKAGE = pkg('$rc_annual', '9,99 €')
export const LIFETIME_PACKAGE = pkg('$rc_lifetime', '29,99 €')

// Node 26 expose un `localStorage` vide qui masque celui de jsdom.
export function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }
}

export function offerings(packages: PurchasesPackage[]): PurchasesOfferings {
  const current = {
    identifier: 'default',
    availablePackages: packages,
  } as PurchasesOfferings['all'][string]
  return { all: { default: current }, current }
}
