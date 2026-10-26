import { isSharedSecret } from '../_shared/shared-secret.ts'

export const SIGNATURE_HEADER = 'X-RevenueCat-Webhook-Signature'
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

const TIMESTAMP = /^\d{1,12}$/
const HMAC_SHA256_HEX = /^[0-9a-f]{64}$/

type Signature = { t: string; v1: string }

/** Exactement `t` et `v1`, une fois chacun : RevenueCat n'envoie qu'un `v1`. */
function signatureIn(header: string): Signature | null {
  const fields = new Map<string, string>()
  for (const field of header.split(',')) {
    const separator = field.indexOf('=')
    if (separator < 0) return null
    const key = field.slice(0, separator)
    if (fields.has(key)) return null
    fields.set(key, field.slice(separator + 1))
  }
  const t = fields.get('t')
  const v1 = fields.get('v1')
  if (fields.size !== 2 || t === undefined || v1 === undefined) return null
  if (!TIMESTAMP.test(t) || !HMAC_SHA256_HEX.test(v1)) return null
  return { t, v1 }
}

async function hmacSha256Hex(secret: string, message: Uint8Array): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function signedPayload(t: string, body: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${t}.`)
  const payload = new Uint8Array(prefix.length + body.length)
  payload.set(prefix)
  payload.set(body, prefix.length)
  return payload
}

/** HMAC-SHA256 de `"<t>.<corps>"` sur les octets reçus, `t` à 5 minutes au plus de `nowMs`. */
export async function isSignedByRevenuecat(
  header: string | null,
  body: Uint8Array,
  secret: string,
  nowMs: number,
): Promise<boolean> {
  const signature = header === null ? null : signatureIn(header)
  if (!signature) return false
  if (Math.abs(nowMs / 1000 - Number(signature.t)) > SIGNATURE_TOLERANCE_SECONDS) return false
  const expected = await hmacSha256Hex(secret, signedPayload(signature.t, body))
  return isSharedSecret(signature.v1, expected)
}
