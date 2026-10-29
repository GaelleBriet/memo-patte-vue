import { readableError } from '../_shared/readable-error.ts'
import { isSharedSecret } from '../_shared/shared-secret.ts'
import { isSignedByRevenuecat, SIGNATURE_HEADER } from './webhook-signature.ts'

/** L'objet `event` d'un envoi RevenueCat, champs inconnus compris : RevenueCat en ajoute sans prévenir. */
export type RevenuecatEvent = { id: string; type: string } & Record<string, unknown>

export type WebhookPorts = {
  /** Valeur exacte de l'en-tête `Authorization` réglée dans RevenueCat ; sans elle, tout est refusé. */
  expectedAuthorization: string | undefined
  /** Secret « HMAC webhook signing » de RevenueCat ; sans lui, tout est refusé. */
  signingSecret: string | undefined
  now(): number
  /** Lève pour que RevenueCat renvoie l'événement plus tard. */
  processEvent(event: RevenuecatEvent): Promise<void>
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function eventOf(bytes: Uint8Array): RevenuecatEvent | null {
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  if (!isObject(body) || !isObject(body.event)) return null
  const { id, type } = body.event
  if (typeof id !== 'string' || id === '' || typeof type !== 'string' || type === '') return null
  return body.event as RevenuecatEvent
}

export async function handleRevenuecatWebhook(
  request: Request,
  ports: WebhookPorts,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' })

  const expected = ports.expectedAuthorization?.trim()
  if (!expected) {
    console.error(
      'Webhook RevenueCat refusé : REVENUECAT_WEBHOOK_AUTHORIZATION n’est pas réglé ou trop court',
    )
    return json(503, { error: 'webhook-not-configured' })
  }
  const signingSecret = ports.signingSecret?.trim()
  if (!signingSecret) {
    console.error(
      'Webhook RevenueCat refusé : REVENUECAT_WEBHOOK_SIGNING_SECRET n’est pas réglé, figure dans l’en-tête ou le contient',
    )
    return json(503, { error: 'webhook-not-configured' })
  }
  if (!(await isSharedSecret(request.headers.get('Authorization') ?? '', expected))) {
    return json(401, { error: 'unauthorized' })
  }
  const body = new Uint8Array(await request.arrayBuffer())
  const signature = request.headers.get(SIGNATURE_HEADER)
  if (!(await isSignedByRevenuecat(signature, body, signingSecret, ports.now()))) {
    return json(401, { error: 'unauthorized' })
  }

  const event = eventOf(body)
  if (!event) return json(400, { error: 'invalid-event' })
  if (event.type === 'TEST') return json(200, { status: 'ignored', reason: 'test' })

  try {
    await ports.processEvent(event)
  } catch (cause) {
    console.error('Événement RevenueCat non traité :', event.id, event.type, readableError(cause))
    return json(500, { error: 'processing-failed' })
  }
  return json(200, { status: 'processed' })
}
