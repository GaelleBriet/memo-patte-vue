import { plusAccessFrom, type PlusAccess, type RevenuecatSubscriber } from './plus-access.ts'
import type { RevenuecatEvent } from './webhook-request.ts'

export type PlusEntitlementPorts = {
  now(): number
  accountExists(userId: string): Promise<boolean>
  fetchSubscriber(userId: string): Promise<RevenuecatSubscriber>
  /** N'écrit pas une ligne déjà écrite d'après une lecture plus récente que `readAt`. */
  savePlusAccess(userId: string, access: PlusAccess, readAt: string): Promise<void>
  /** Même garde ; termine à `readAt` une ligne encore ouverte, une fin déjà passée reste pour la purge. */
  endPlusAccess(userId: string, readAt: string): Promise<void>
}

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const IDENTIFIER_FIELDS = ['app_user_id', 'aliases', 'transferred_from', 'transferred_to'] as const

export function accountIdsOf(event: RevenuecatEvent): string[] {
  const ids = new Set<string>()
  for (const field of IDENTIFIER_FIELDS) {
    const value = event[field]
    for (const candidate of Array.isArray(value) ? value : [value]) {
      if (typeof candidate !== 'string') continue
      const id = candidate.toLowerCase()
      if (ACCOUNT_ID.test(id)) ids.add(id)
    }
  }
  return [...ids]
}

/** RevenueCat recrée un client à la lecture : un compte supprimé n'est jamais relu chez lui. */
async function syncAccount(
  event: RevenuecatEvent,
  userId: string,
  ports: PlusEntitlementPorts,
): Promise<void> {
  if (!(await ports.accountExists(userId))) {
    console.warn('Événement RevenueCat ignoré : compte absent', event.id, event.type)
    return
  }
  const readAt = ports.now()
  const readAtIso = new Date(readAt).toISOString()
  const access = plusAccessFrom(await ports.fetchSubscriber(userId), readAt)
  if (access) await ports.savePlusAccess(userId, access, readAtIso)
  else await ports.endPlusAccess(userId, readAtIso)
}

export async function syncPlusEntitlements(
  event: RevenuecatEvent,
  ports: PlusEntitlementPorts,
): Promise<void> {
  const accounts = accountIdsOf(event)
  if (accounts.length === 0) {
    console.warn('Événement RevenueCat ignoré : aucun compte MémoPatte', event.id, event.type)
    return
  }
  for (const userId of accounts) await syncAccount(event, userId, ports)
}
