import { longEnoughSecret } from '../_shared/shared-secret.ts'
import type { WebhookPorts } from './webhook-request.ts'

export type WebhookSettings = Pick<WebhookPorts, 'expectedAuthorization' | 'signingSecret'>

const REFUSAL = 'Webhook RevenueCat désactivé'
const SHARED_RUN_LIMIT = 16
const BEARER_PREFIX = 'bearer '

function sharesRun(header: string, secret: string): boolean {
  for (let start = 0; start + SHARED_RUN_LIMIT <= header.length; start++) {
    if (secret.includes(header.slice(start, start + SHARED_RUN_LIMIT))) return true
  }
  return false
}

function signingSecretApartFrom(
  authorization: string | undefined,
  signingSecret: string | undefined,
): string | undefined {
  if (!signingSecret) return undefined
  if (!authorization) return signingSecret
  const header = authorization.toLowerCase()
  const secret = signingSecret.toLowerCase()
  const token = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : header
  if (!header.includes(secret) && !secret.includes(header) && !sharesRun(token, secret)) {
    return signingSecret
  }
  console.error(
    `${REFUSAL} : REVENUECAT_WEBHOOK_AUTHORIZATION ne doit pas contenir REVENUECAT_WEBHOOK_SIGNING_SECRET, ni l'inverse, ni partager avec lui ${SHARED_RUN_LIMIT} caractères à la suite`,
  )
  return undefined
}

export function webhookSettingsFrom(env: (name: string) => string | undefined): WebhookSettings {
  const authorization = env('REVENUECAT_WEBHOOK_AUTHORIZATION')?.trim()
  return {
    expectedAuthorization: longEnoughSecret(
      authorization,
      'REVENUECAT_WEBHOOK_AUTHORIZATION',
      REFUSAL,
    ),
    signingSecret: signingSecretApartFrom(
      authorization,
      env('REVENUECAT_WEBHOOK_SIGNING_SECRET')?.trim(),
    ),
  }
}
