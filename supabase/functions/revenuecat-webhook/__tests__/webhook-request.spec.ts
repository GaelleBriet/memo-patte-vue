// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleRevenuecatWebhook, type RevenuecatEvent } from '../webhook-request'

const AUTHORIZATION = 'Bearer secret-du-webhook'
const SOPHIE = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

function renewalOfSophie(): Record<string, unknown> {
  return {
    api_version: '1.0',
    event: {
      id: 'B9A1E1C4-2F3D-4E5A-8B6C-7D8E9F0A1B2C',
      type: 'RENEWAL',
      app_user_id: SOPHIE,
      product_id: 'memopatte_plus:annual',
      entitlement_ids: ['plus'],
      expiration_at_ms: Date.UTC(2028, 2, 3),
      environment: 'PRODUCTION',
    },
  }
}

function request(
  init: { method?: string; authorization?: string | null; body?: string | null } = {},
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (init.authorization !== null) headers.set('Authorization', init.authorization ?? AUTHORIZATION)
  const body = init.body === undefined ? JSON.stringify(renewalOfSophie()) : init.body
  return new Request('http://localhost/functions/v1/revenuecat-webhook', {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'GET' ? null : body,
  })
}

function fakePorts(options: { expectedAuthorization?: string | undefined; fails?: boolean } = {}) {
  const processed: RevenuecatEvent[] = []
  return {
    processed,
    ports: {
      expectedAuthorization:
        'expectedAuthorization' in options ? options.expectedAuthorization : AUTHORIZATION,
      async processEvent(event: RevenuecatEvent) {
        if (options.fails) throw new Error('base injoignable')
        processed.push(event)
      },
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleRevenuecatWebhook', () => {
  it('transmet un événement authentifié et répond 200', async () => {
    const fake = fakePorts()

    const response = await handleRevenuecatWebhook(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'processed' })
    expect(fake.processed).toEqual([renewalOfSophie().event])
  })

  it('refuse une autre méthode que POST', async () => {
    const fake = fakePorts()

    const response = await handleRevenuecatWebhook(request({ method: 'GET' }), fake.ports)

    expect(response.status).toBe(405)
    expect(fake.processed).toEqual([])
  })

  it.each([
    ['absent', null],
    ['faux', 'Bearer un-autre-secret'],
    ['sans le préfixe réglé', 'secret-du-webhook'],
  ])('refuse un en-tête Authorization %s', async (_, authorization) => {
    const fake = fakePorts()

    const response = await handleRevenuecatWebhook(request({ authorization }), fake.ports)

    expect(response.status).toBe(401)
    expect(fake.processed).toEqual([])
  })

  it.each([undefined, '', '   '])(
    'refuse tout tant que le secret n’est pas réglé sur le serveur (%j)',
    async (expectedAuthorization) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const fake = fakePorts({ expectedAuthorization })

      const response = await handleRevenuecatWebhook(
        request({ authorization: expectedAuthorization ?? '' }),
        fake.ports,
      )

      expect(response.status).toBe(503)
      expect(fake.processed).toEqual([])
    },
  )

  it.each([
    ['du texte', 'pas du json'],
    ['un tableau', '[]'],
    ['sans événement', JSON.stringify({ api_version: '1.0' })],
    ['un événement sans identifiant', JSON.stringify({ event: { type: 'RENEWAL' } })],
    ['un événement sans type', JSON.stringify({ event: { id: 'abc' } })],
    ['un identifiant vide', JSON.stringify({ event: { id: '', type: 'RENEWAL' } })],
  ])('refuse un corps qui contient %s', async (_, body) => {
    const fake = fakePorts()

    const response = await handleRevenuecatWebhook(request({ body }), fake.ports)

    expect(response.status).toBe(400)
    expect(fake.processed).toEqual([])
  })

  it('accuse réception de l’événement de test du tableau de bord sans rien écrire', async () => {
    const fake = fakePorts()
    const test = { api_version: '1.0', event: { ...renewalOfSophie().event!, type: 'TEST' } }

    const response = await handleRevenuecatWebhook(
      request({ body: JSON.stringify(test) }),
      fake.ports,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ignored', reason: 'test' })
    expect(fake.processed).toEqual([])
  })

  it('répond 500 quand le traitement échoue, pour que RevenueCat renvoie l’événement', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = fakePorts({ fails: true })

    const response = await handleRevenuecatWebhook(request(), fake.ports)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'processing-failed' })
    expect(error).toHaveBeenCalledWith(
      'Événement RevenueCat non traité :',
      'B9A1E1C4-2F3D-4E5A-8B6C-7D8E9F0A1B2C',
      'RENEWAL',
      'base injoignable',
    )
  })
})
