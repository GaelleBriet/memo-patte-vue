import { differenceInDays, parseISO } from 'date-fns'
import { z } from 'zod'

import { NO_PLUS, subscriptionOf, type PlusStatus, type SubscriptionPlan } from './plus-status'

export const PLUS_STATUS_STORAGE_KEY = 'memopatte.plus.status'

/** Au-delà, l'app oublie l'abonnement échu : ni bandeau « en pause », ni appel au store. */
export const SUBSCRIPTION_MEMORY_DAYS = 30

export type StoredPlusStatus = PlusStatus & {
  /** Dernier abonnement payant connu : Google Play dira « aucun droit » une fois échu. */
  lastSubscription: SubscriptionPlan | null
  /** Fin de cet abonnement, ISO 8601, d'où court le délai d'oubli. */
  subscriptionEndedAt: string | null
}

export type WritablePlusStatus = PlusStatus & Partial<Omit<StoredPlusStatus, keyof PlusStatus>>

export const NO_STORED_PLUS: StoredPlusStatus = {
  ...NO_PLUS,
  lastSubscription: null,
  subscriptionEndedAt: null,
}

const storedPlusStatusSchema = z.object({
  plan: z.enum(['none', 'monthly', 'annual', 'lifetime']),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  lastSubscription: z.enum(['monthly', 'annual']).nullable().optional(),
  subscriptionEndedAt: z.iso.datetime({ offset: true }).nullable().optional(),
})

function complete(status: WritablePlusStatus): StoredPlusStatus {
  const lastSubscription = status.lastSubscription ?? subscriptionOf(status)
  const lapsed = status.expiresAt !== null && Date.parse(status.expiresAt) <= Date.now()
  return {
    plan: status.plan,
    expiresAt: status.expiresAt,
    lastSubscription,
    subscriptionEndedAt:
      lastSubscription === null
        ? null
        : (status.subscriptionEndedAt ?? (lapsed ? status.expiresAt : null)),
  }
}

function forgetLapsedMemory(status: StoredPlusStatus): StoredPlusStatus {
  const { subscriptionEndedAt } = status
  if (subscriptionEndedAt === null) return status
  if (differenceInDays(new Date(), parseISO(subscriptionEndedAt)) < SUBSCRIPTION_MEMORY_DAYS)
    return status
  return { ...status, lastSubscription: null, subscriptionEndedAt: null }
}

export function readStoredPlusStatus(): StoredPlusStatus {
  try {
    const raw = localStorage.getItem(PLUS_STATUS_STORAGE_KEY)
    if (raw === null) return NO_STORED_PLUS
    const parsed = storedPlusStatusSchema.safeParse(JSON.parse(raw))
    return parsed.success ? forgetLapsedMemory(complete(parsed.data)) : NO_STORED_PLUS
  } catch {
    return NO_STORED_PLUS
  }
}

export function writeStoredPlusStatus(status: WritablePlusStatus): void {
  try {
    localStorage.setItem(PLUS_STATUS_STORAGE_KEY, JSON.stringify(complete(status)))
  } catch (cause) {
    console.warn('Statut Plus non enregistré :', cause)
  }
}

export function clearStoredPlusStatus(): void {
  try {
    localStorage.removeItem(PLUS_STATUS_STORAGE_KEY)
  } catch (cause) {
    console.warn('Statut Plus non effacé :', cause)
  }
}
