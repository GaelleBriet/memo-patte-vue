// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { fakeFetch, jsonResponse } from '../../_shared/__tests__/fake-fetch'
import { revenuecatSubscriberReader } from '../revenuecat-subscriber'

const SOPHIE = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const SUBSCRIBER = { entitlements: { plus: { expires_date: null, product_identifier: 'x' } } }

describe('revenuecatSubscriberReader', () => {
  it('lit le client par l’API v1 avec la clé secrète, sans se déclarer comme appareil', async () => {
    const fake = fakeFetch(() => jsonResponse(200, { subscriber: SUBSCRIBER }))

    const subscriber = await revenuecatSubscriberReader('sk_test', fake.fetch)(SOPHIE)

    expect(subscriber).toEqual(SUBSCRIBER)
    expect(fake.requests).toHaveLength(1)
    const [request] = fake.requests
    expect(request!.method).toBe('GET')
    expect(request!.url).toBe(`https://api.revenuecat.com/v1/subscribers/${SOPHIE}`)
    expect(request!.headers.get('Authorization')).toBe('Bearer sk_test')
    expect(request!.headers.has('X-Platform')).toBe(false)
    expect(request!.signal).not.toBeNull()
  })

  it('échoue sans clé secrète, sans rien envoyer', async () => {
    const fake = fakeFetch(() => jsonResponse(200, { subscriber: SUBSCRIBER }))

    await expect(revenuecatSubscriberReader(undefined, fake.fetch)(SOPHIE)).rejects.toThrow(
      'REVENUECAT_SECRET_KEY n’est pas réglé',
    )
    expect(fake.requests).toEqual([])
  })

  it.each([401, 429, 500])('échoue quand RevenueCat répond %i', async (status) => {
    const fake = fakeFetch(() => jsonResponse(status, { message: 'non' }))

    await expect(revenuecatSubscriberReader('sk_test', fake.fetch)(SOPHIE)).rejects.toThrow(
      `RevenueCat a répondu ${status}`,
    )
  })

  it('échoue sur une réponse sans client', async () => {
    const fake = fakeFetch(() => jsonResponse(200, { request_date: 'x' }))

    await expect(revenuecatSubscriberReader('sk_test', fake.fetch)(SOPHIE)).rejects.toThrow(
      'RevenueCat a répondu sans client',
    )
  })

  it('échoue sans répéter le message réseau, qui peut contenir la clé', async () => {
    const send: typeof fetch = async () => {
      throw new Error('échec vers https://api.revenuecat.com avec sk_test')
    }

    await expect(revenuecatSubscriberReader('sk_test', send)(SOPHIE)).rejects.toThrow(
      /^RevenueCat injoignable$/,
    )
  })
})
