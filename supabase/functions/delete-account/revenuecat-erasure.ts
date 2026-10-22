import { sendTo, type ProviderErasure } from './account-erasure.ts'

export const REVENUECAT_API = 'https://api.revenuecat.com/v1'

/** Un client inconnu (404) est déjà effacé ou n'a jamais existé : c'est un succès. */
export function revenuecatCustomerErasure(secretKey: string, send: typeof fetch): ProviderErasure {
  return async (userId) => {
    const url = `${REVENUECAT_API}/subscribers/${encodeURIComponent(userId)}`
    const response = await sendTo('RevenueCat', send, url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    if (response.status === 404) {
      await response.body?.cancel()
      return
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`RevenueCat a répondu ${response.status}`)
    }
    const result: unknown = await response.json().catch(() => null)
    if ((result as { deleted?: unknown } | null)?.deleted !== true) {
      throw new Error('RevenueCat n’a pas accepté la suppression')
    }
  }
}
