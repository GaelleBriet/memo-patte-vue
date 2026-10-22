import { sendTo } from '../_shared/provider-request.ts'
import { REVENUECAT_API } from '../_shared/revenuecat-api.ts'
import type { RevenuecatSubscriber } from './plus-access.ts'

export type SubscriberReader = (userId: string) => Promise<RevenuecatSubscriber>

export function revenuecatSubscriberReader(
  secretKey: string | undefined,
  send: typeof fetch,
): SubscriberReader {
  return async (userId) => {
    if (!secretKey) throw new Error('REVENUECAT_SECRET_KEY n’est pas réglé')
    const url = `${REVENUECAT_API}/subscribers/${encodeURIComponent(userId)}`
    const response = await sendTo('RevenueCat', send, url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`RevenueCat a répondu ${response.status}`)
    }
    const body: unknown = await response.json().catch(() => null)
    const subscriber = (body as { subscriber?: unknown } | null)?.subscriber
    if (typeof subscriber !== 'object' || subscriber === null) {
      throw new Error('RevenueCat a répondu sans client')
    }
    return subscriber as RevenuecatSubscriber
  }
}
