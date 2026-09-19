// @vitest-environment node
import { Purchases, type PurchasesPlugin } from '@revenuecat/purchases-capacitor'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BillingError, createBillingService, type BillingService } from '../service/billing.service'
import { NO_PLUS } from '../logic/plus-status'
import {
  ANNUAL_PACKAGE,
  customerInfo,
  entitlement,
  LIFETIME,
  LIFETIME_PACKAGE,
  MONTHLY_PACKAGE,
  offerings,
} from './billing-fixture'

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure: vi.fn<PurchasesPlugin['configure']>(),
    getOfferings: vi.fn<PurchasesPlugin['getOfferings']>(),
    purchasePackage: vi.fn<PurchasesPlugin['purchasePackage']>(),
    getCustomerInfo: vi.fn<PurchasesPlugin['getCustomerInfo']>(),
    restorePurchases: vi.fn<PurchasesPlugin['restorePurchases']>(),
    logIn: vi.fn<PurchasesPlugin['logIn']>(),
    logOut: vi.fn<PurchasesPlugin['logOut']>(),
    collectDeviceIdentifiers: vi.fn<PurchasesPlugin['collectDeviceIdentifiers']>(),
    setAttributes: vi.fn<PurchasesPlugin['setAttributes']>(),
  },
}))

const plugin = vi.mocked(Purchases)

const API_KEY = 'goog_test'

function nativeService(apiKey: string | undefined): BillingService {
  return createBillingService({ apiKey, isNativePlatform: () => true })
}

function capacitorRejection(message: string, code: string, data: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { code, data })
}

beforeEach(() => {
  vi.clearAllMocks()
  plugin.configure.mockResolvedValue()
  plugin.getOfferings.mockResolvedValue(
    offerings([LIFETIME_PACKAGE, ANNUAL_PACKAGE, MONTHLY_PACKAGE]),
  )
  plugin.getCustomerInfo.mockResolvedValue({ customerInfo: customerInfo(null) })
})

describe('billing indisponible', () => {
  it('sans clé ou hors natif : aucune offre, aucun appel au plugin', async () => {
    for (const service of [
      nativeService(''),
      nativeService(undefined),
      createBillingService({ apiKey: API_KEY, isNativePlatform: () => false }),
    ]) {
      expect(service.isAvailable()).toBe(false)
      await expect(service.listOffers()).resolves.toEqual([])
    }

    expect(plugin.configure).not.toHaveBeenCalled()
  })

  it('refuse l’achat, la vérification et la restauration par une erreur typée', async () => {
    const service = nativeService('')

    for (const attempt of [
      service.purchase('annual'),
      service.fetchStatus(),
      service.restore(),
      service.logIn('0f8fad5b-d9cb-469f-a165-70867728950e'),
      service.logOut(),
    ]) {
      await expect(attempt).rejects.toMatchObject({ name: 'BillingError', reason: 'unavailable' })
    }
  })
})

describe('initialisation paresseuse', () => {
  it('ne configure rien à la création du service', () => {
    nativeService(API_KEY)

    expect(plugin.configure).not.toHaveBeenCalled()
  })

  it('configure une seule fois, sans collecte d’identifiants de l’appareil', async () => {
    const service = nativeService(API_KEY)

    await Promise.all([service.listOffers(), service.fetchStatus()])
    await service.fetchStatus()

    expect(plugin.configure).toHaveBeenCalledTimes(1)
    expect(plugin.configure).toHaveBeenCalledWith({
      apiKey: API_KEY,
      automaticDeviceIdentifierCollectionEnabled: false,
    })
    expect(plugin.collectDeviceIdentifiers).not.toHaveBeenCalled()
    expect(plugin.setAttributes).not.toHaveBeenCalled()
  })

  it('réessaie la configuration après un échec', async () => {
    plugin.configure.mockRejectedValueOnce(new Error('réseau'))
    const service = nativeService(API_KEY)

    await expect(service.fetchStatus()).rejects.toMatchObject({ reason: 'failed' })
    await expect(service.fetchStatus()).resolves.toEqual(NO_PLUS)

    expect(plugin.configure).toHaveBeenCalledTimes(2)
  })
})

describe('listOffers', () => {
  it('liste les trois offres du plus court au plus long, avec leur prix localisé', async () => {
    await expect(nativeService(API_KEY).listOffers()).resolves.toEqual([
      { plan: 'monthly', priceString: '1,49 €' },
      { plan: 'annual', priceString: '9,99 €' },
      { plan: 'lifetime', priceString: '29,99 €' },
    ])
  })

  it('ignore les packages inconnus et une offering absente', async () => {
    const other = { ...ANNUAL_PACKAGE, identifier: '$rc_weekly' }
    plugin.getOfferings.mockResolvedValueOnce(offerings([other, LIFETIME_PACKAGE]))
    const service = nativeService(API_KEY)

    await expect(service.listOffers()).resolves.toEqual([
      { plan: 'lifetime', priceString: '29,99 €' },
    ])

    plugin.getOfferings.mockResolvedValueOnce({ all: {}, current: null })
    await expect(service.listOffers()).resolves.toEqual([])
  })

  it('signale un échec du store par une erreur typée', async () => {
    plugin.getOfferings.mockRejectedValueOnce(capacitorRejection('offline', '10'))

    await expect(nativeService(API_KEY).listOffers()).rejects.toBeInstanceOf(BillingError)
  })
})

describe('purchase', () => {
  it('achète le package de l’offre choisie et renvoie le nouveau statut', async () => {
    plugin.purchasePackage.mockResolvedValueOnce({
      productIdentifier: 'memopatte_plus_lifetime',
      customerInfo: customerInfo(entitlement(LIFETIME)),
      transaction: {} as never,
    })

    await expect(nativeService(API_KEY).purchase('lifetime')).resolves.toEqual({
      kind: 'purchased',
      status: { plan: 'lifetime', expiresAt: null },
    })
    expect(plugin.purchasePackage).toHaveBeenCalledWith({ aPackage: LIFETIME_PACKAGE })
  })

  it('distingue l’achat annulé par l’utilisateur d’une erreur', async () => {
    plugin.purchasePackage.mockRejectedValueOnce(
      capacitorRejection('Purchase was cancelled.', '1', { userCancelled: true }),
    )

    await expect(nativeService(API_KEY).purchase('annual')).resolves.toEqual({ kind: 'cancelled' })
  })

  it('remonte les autres échecs en erreur typée, cause conservée', async () => {
    const cause = capacitorRejection('There was a problem with the store.', '2')
    plugin.purchasePackage.mockRejectedValueOnce(cause)

    await expect(nativeService(API_KEY).purchase('monthly')).rejects.toMatchObject({
      name: 'BillingError',
      reason: 'failed',
      cause,
    })
  })

  it('refuse une offre absente de l’offering', async () => {
    plugin.getOfferings.mockResolvedValueOnce(offerings([ANNUAL_PACKAGE]))

    await expect(nativeService(API_KEY).purchase('monthly')).rejects.toMatchObject({
      reason: 'unavailable',
    })
    expect(plugin.purchasePackage).not.toHaveBeenCalled()
  })
})

describe('statut, restauration et compte', () => {
  it('fetchStatus lit le droit plus du client', async () => {
    plugin.getCustomerInfo.mockResolvedValueOnce({ customerInfo: customerInfo(entitlement()) })

    await expect(nativeService(API_KEY).fetchStatus()).resolves.toEqual({
      plan: 'annual',
      expiresAt: '2027-09-01T10:00:00Z',
    })
  })

  it('restore renvoie le statut restauré', async () => {
    plugin.restorePurchases.mockResolvedValueOnce({
      customerInfo: customerInfo(entitlement(LIFETIME)),
    })

    await expect(nativeService(API_KEY).restore()).resolves.toEqual({
      plan: 'lifetime',
      expiresAt: null,
    })
  })

  it('logIn identifie par l’UUID du compte et renvoie son statut', async () => {
    const userId = '0f8fad5b-d9cb-469f-a165-70867728950e'
    plugin.logIn.mockResolvedValueOnce({
      customerInfo: customerInfo(entitlement()),
      created: false,
    })

    await expect(nativeService(API_KEY).logIn(userId)).resolves.toMatchObject({ plan: 'annual' })
    expect(plugin.logIn).toHaveBeenCalledWith({ appUserID: userId })
  })

  it('logOut détache l’app-user sans rapporter le statut du nouvel anonyme', async () => {
    plugin.logOut.mockResolvedValueOnce({ customerInfo: customerInfo(null) })

    await expect(nativeService(API_KEY).logOut()).resolves.toBeUndefined()
    expect(plugin.logOut).toHaveBeenCalledOnce()
  })
})
