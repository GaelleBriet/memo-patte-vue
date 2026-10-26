import { longEnoughSecret } from '../_shared/shared-secret.ts'
import type { WebhookPorts } from './webhook-request.ts'

export type WebhookSettings = Pick<WebhookPorts, 'expectedAuthorization' | 'signingSecret'>

const REFUSAL = 'Webhook RevenueCat désactivé'

function signingSecretDistinctFrom(
  authorization: string | undefined,
  signingSecret: string | undefined,
): string | undefined {
  if (!signingSecret) return undefined
  if (signingSecret !== authorization) return signingSecret
  console.error(
    `${REFUSAL} : REVENUECAT_WEBHOOK_AUTHORIZATION et REVENUECAT_WEBHOOK_SIGNING_SECRET doivent être différents`,
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
    signingSecret: signingSecretDistinctFrom(
      authorization,
      env('REVENUECAT_WEBHOOK_SIGNING_SECRET')?.trim(),
    ),
  }
}
