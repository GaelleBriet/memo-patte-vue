// @vitest-environment node
import { createHmac } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleRevenuecatWebhook, type RevenuecatEvent } from '../webhook-request'

const AUTHORIZATION = 'Bearer secret-du-webhook'
const SIGNING_SECRET = 'whsec_secret-de-signature-revenuecat'
const NOW = Date.UTC(2027, 2, 3, 10, 0, 0)
const NOW_SECONDS = NOW / 1000
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

function signatureOf(body: string, at: number | string = NOW_SECONDS, secret = SIGNING_SECRET) {
  const v1 = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')
  return `t=${at},v1=${v1}`
}

function request(
  init: {
    method?: string
    authorization?: string | null
    body?: string | null
    signature?: string | null
  } = {},
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (init.authorization !== null) headers.set('Authorization', init.authorization ?? AUTHORIZATION)
  const body = init.body === undefined ? JSON.stringify(renewalOfSophie()) : init.body
  if (init.signature !== null) {
    headers.set('X-RevenueCat-Webhook-Signature', init.signature ?? signatureOf(body ?? ''))
  }
  return new Request('http://localhost/functions/v1/revenuecat-webhook', {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'GET' ? null : body,
  })
}

function fakePorts(
  options: {
    expectedAuthorization?: string | undefined
    signingSecret?: string | undefined
    now?: number
    fails?: boolean
  } = {},
) {
  const processed: RevenuecatEvent[] = []
  return {
    processed,
    ports: {
      expectedAuthorization:
        'expectedAuthorization' in options ? options.expectedAuthorization : AUTHORIZATION,
      signingSecret: 'signingSecret' in options ? options.signingSecret : SIGNING_SECRET,
      now: () => options.now ?? NOW,
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

  it('refuse l’événement de test du tableau de bord quand il n’est pas signé', async () => {
    const fake = fakePorts()
    const test = { api_version: '1.0', event: { ...renewalOfSophie().event!, type: 'TEST' } }

    const response = await handleRevenuecatWebhook(
      request({ body: JSON.stringify(test), signature: null }),
      fake.ports,
    )

    expect(response.status).toBe(401)
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

  it('journalise lisiblement une erreur Postgrest levée telle quelle, pas « [object Object] »', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = fakePorts()
    const postgrest = { code: '42501', message: 'permission denied', details: null, hint: null }

    const response = await handleRevenuecatWebhook(request(), {
      ...fake.ports,
      processEvent: () => Promise.reject(postgrest),
    })

    expect(response.status).toBe(500)
    expect(error).toHaveBeenCalledWith(
      'Événement RevenueCat non traité :',
      'B9A1E1C4-2F3D-4E5A-8B6C-7D8E9F0A1B2C',
      'RENEWAL',
      'message: permission denied, code: 42501',
    )
  })
})

describe('handleRevenuecatWebhook, signature de RevenueCat', () => {
  const BODY = JSON.stringify(renewalOfSophie())
  const GOOD_V1 = signatureOf(BODY).split(',v1=')[1]!

  async function statusOf(init: Parameters<typeof request>[0]) {
    const fake = fakePorts()
    const response = await handleRevenuecatWebhook(request(init), fake.ports)
    return { status: response.status, processed: fake.processed }
  }

  it('accepte un envoi signé sur les octets reçus, espaces et accents compris', async () => {
    const body = `{ "event" : { "id": "évt-1", "type": "RENEWAL", "note": "café" } }\n`

    expect(await statusOf({ body })).toEqual({
      status: 200,
      processed: [{ id: 'évt-1', type: 'RENEWAL', note: 'café' }],
    })
  })

  it('accepte les deux champs dans l’autre ordre', async () => {
    expect((await statusOf({ signature: `v1=${GOOD_V1},t=${NOW_SECONDS}` })).status).toBe(200)
  })

  it.each([
    ['absente', null],
    ['faite avec un autre secret', signatureOf(BODY, NOW_SECONDS, 'whsec_un-autre-secret')],
    ['faite sur un autre corps', signatureOf(BODY.replace('RENEWAL', 'INITIAL_PURCHASE'))],
    ['faite pour un autre instant', `t=${NOW_SECONDS - 1},v1=${GOOD_V1}`],
    ['trop ancienne (5 min et 1 s)', signatureOf(BODY, NOW_SECONDS - 301)],
    ['trop en avance (5 min et 1 s)', signatureOf(BODY, NOW_SECONDS + 301)],
  ])('refuse une signature %s, sans rien traiter', async (_, signature) => {
    expect(await statusOf({ signature })).toEqual({ status: 401, processed: [] })
  })

  it.each([
    ['5 min avant', NOW_SECONDS - 300],
    ['5 min après', NOW_SECONDS + 300],
  ])('accepte une signature datée de %s', async (_, at) => {
    expect((await statusOf({ signature: signatureOf(BODY, at) })).status).toBe(200)
  })

  it.each([
    ['vide', ''],
    ['sans horodatage', `v1=${GOOD_V1}`],
    ['sans v1', `t=${NOW_SECONDS}`],
    ['horodatage illisible', `t=demain,v1=${GOOD_V1}`],
    ['horodatage en millisecondes', `t=${NOW},v1=${GOOD_V1}`],
    ['v1 en majuscules', `t=${NOW_SECONDS},v1=${GOOD_V1.toUpperCase()}`],
    ['v1 tronqué', `t=${NOW_SECONDS},v1=${GOOD_V1.slice(1)}`],
    ['deux v1, dont le bon', `t=${NOW_SECONDS},v1=${'0'.repeat(64)},v1=${GOOD_V1}`],
    ['deux fois le bon v1', `t=${NOW_SECONDS},v1=${GOOD_V1},v1=${GOOD_V1}`],
    ['deux horodatages', `t=${NOW_SECONDS},t=${NOW_SECONDS},v1=${GOOD_V1}`],
    ['un champ inconnu', `t=${NOW_SECONDS},v1=${GOOD_V1},v0=abc`],
    ['des espaces', `t=${NOW_SECONDS}, v1=${GOOD_V1}`],
    ['un champ sans signe égal', `t=${NOW_SECONDS},v1`],
  ])('refuse un en-tête de signature mal formé (%s)', async (_, signature) => {
    expect(await statusOf({ signature })).toEqual({ status: 401, processed: [] })
  })

  it.each([
    ['décimal', `${NOW_SECONDS}.5`, NOW],
    ['hexadécimal', `0x${NOW_SECONDS.toString(16)}`, NOW],
    ['en notation exponentielle', `${NOW_SECONDS / 1000}e3`, NOW],
    ['précédé d’une espace', ` ${NOW_SECONDS}`, NOW],
    ['négatif, à l’heure de l’époque Unix', '-1', 0],
    ['vide, à l’heure de l’époque Unix', '', 0],
  ])('refuse un horodatage %s même signé avec le bon secret', async (_, at, now) => {
    const fake = fakePorts({ now })

    const response = await handleRevenuecatWebhook(
      request({ signature: signatureOf(BODY, at) }),
      fake.ports,
    )

    expect(response.status).toBe(401)
    expect(fake.processed).toEqual([])
  })

  it.each([
    ['une méthode autre que POST', { method: 'GET' }],
    ['un en-tête Authorization faux', { authorization: 'Bearer un-autre-secret' }],
  ])('ne lit jamais le corps sur %s', async (_, init) => {
    const fake = fakePorts()
    const sent = request(init)
    const reads = [
      vi.spyOn(sent, 'arrayBuffer'),
      vi.spyOn(sent, 'text'),
      vi.spyOn(sent, 'json'),
      vi.spyOn(sent, 'bytes'),
    ]

    const response = await handleRevenuecatWebhook(sent, fake.ports)

    expect(response.status).toBeGreaterThanOrEqual(400)
    for (const read of reads) expect(read).not.toHaveBeenCalled()
  })

  it('exige aussi l’en-tête Authorization quand la signature est juste', async () => {
    expect(await statusOf({ authorization: null })).toEqual({ status: 401, processed: [] })
  })

  it.each([undefined, '', '   '])(
    'refuse tout tant que le secret de signature n’est pas réglé (%j), et le dit',
    async (signingSecret) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const fake = fakePorts({ signingSecret })

      const response = await handleRevenuecatWebhook(request(), fake.ports)

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: 'webhook-not-configured' })
      expect(fake.processed).toEqual([])
      expect(JSON.stringify(error.mock.calls)).toContain(
        'REVENUECAT_WEBHOOK_SIGNING_SECRET n’est pas réglé, figure dans l’en-tête ou le contient',
      )
    },
  )

  it('vérifie la signature avant de lire le JSON : un corps illisible non signé reçoit 401, pas 400', async () => {
    const fake = fakePorts()
    const response = await handleRevenuecatWebhook(
      request({ body: 'pas du json', signature: null }),
      fake.ports,
    )

    expect(response.status).toBe(401)
  })
})

describe('handleRevenuecatWebhook, achat de test d’un testeur de licence', () => {
  it('traite un événement SANDBOX comme un événement PRODUCTION', async () => {
    const sandbox = renewalOfSophie()
    Object.assign(sandbox.event as Record<string, unknown>, { environment: 'SANDBOX' })
    const fake = fakePorts()

    const response = await handleRevenuecatWebhook(
      request({ body: JSON.stringify(sandbox) }),
      fake.ports,
    )

    expect(response.status).toBe(200)
    expect(fake.processed).toEqual([sandbox.event])
  })
})
