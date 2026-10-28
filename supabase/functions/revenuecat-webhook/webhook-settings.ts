import { longEnoughSecret } from '../_shared/shared-secret.ts'
import type { WebhookPorts } from './webhook-request.ts'

export type WebhookSettings = Pick<WebhookPorts, 'expectedAuthorization' | 'signingSecret'>

const REFUSAL = 'Webhook RevenueCat désactivé'

function signingSecretApartFrom(
  authorization: string | undefined,
  signingSecret: string | undefined,
): string | undefined {
  if (!signingSecret) return undefined
  if (!authorization) return signingSecret
  if (!authorization.includes(signingSecret) && !signingSecret.includes(authorization)) {
    return signingSecret
  }
  console.error(
    `${REFUSAL} : REVENUECAT_WEBHOOK_AUTHORIZATION ne doit pas contenir REVENUECAT_WEBHOOK_SIGNING_SECRET, ni l'inverse`,
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
