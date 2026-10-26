import { longEnoughSecret } from '../_shared/shared-secret.ts'
import type { WebhookPorts } from './webhook-request.ts'

export type WebhookSettings = Pick<WebhookPorts, 'expectedAuthorization' | 'signingSecret'>

export function webhookSettingsFrom(env: (name: string) => string | undefined): WebhookSettings {
  return {
    expectedAuthorization: longEnoughSecret(
      env('REVENUECAT_WEBHOOK_AUTHORIZATION')?.trim(),
      'REVENUECAT_WEBHOOK_AUTHORIZATION',
      'Webhook RevenueCat désactivé',
    ),
    signingSecret: env('REVENUECAT_WEBHOOK_SIGNING_SECRET')?.trim() || undefined,
  }
}
