import { z } from 'zod'

import { NO_PLUS, subscriptionOf, type PlusStatus, type SubscriptionPlan } from './plus-status'

export const PLUS_STATUS_STORAGE_KEY = 'memopatte.plus.status'

export type StoredPlusStatus = PlusStatus & {
  /** Dernier abonnement payant connu : Google Play dira « aucun droit » une fois expiré. */
  lastSubscription: SubscriptionPlan | null
}

export const NO_STORED_PLUS: StoredPlusStatus = { ...NO_PLUS, lastSubscription: null }

const storedPlusStatusSchema = z.object({
  plan: z.enum(['none', 'monthly', 'annual', 'lifetime']),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  lastSubscription: z.enum(['monthly', 'annual']).nullable().optional(),
})

function complete(status: PlusStatus & { lastSubscription?: SubscriptionPlan | null }) {
  return { ...status, lastSubscription: status.lastSubscription ?? subscriptionOf(status) }
}

export function readStoredPlusStatus(): StoredPlusStatus {
  try {
    const raw = localStorage.getItem(PLUS_STATUS_STORAGE_KEY)
    if (raw === null) return NO_STORED_PLUS
    const parsed = storedPlusStatusSchema.safeParse(JSON.parse(raw))
    return parsed.success ? complete(parsed.data) : NO_STORED_PLUS
  } catch {
    return NO_STORED_PLUS
  }
}

export function writeStoredPlusStatus(
  status: PlusStatus & { lastSubscription?: SubscriptionPlan | null },
): void {
  try {
    localStorage.setItem(PLUS_STATUS_STORAGE_KEY, JSON.stringify(complete(status)))
  } catch (cause) {
    console.warn('Statut Plus non enregistré :', cause)
  }
}
