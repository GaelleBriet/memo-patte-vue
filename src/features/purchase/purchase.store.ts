import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  billingService,
  type PaidPlan,
  type PlusOffer,
  type PurchaseOutcome,
} from './billing.service'
import { NO_PLUS, subscriptionOf, type PlusStatus, type SubscriptionPlan } from './plus-status'
import {
  NO_STORED_PLUS,
  readStoredPlusStatus,
  writeStoredPlusStatus,
  type StoredPlusStatus,
} from './plus-status-storage'
import { errorSummary } from '@/shared/error-summary'

function remember(next: PlusStatus, previous: StoredPlusStatus): StoredPlusStatus {
  if (next.plan !== 'none')
    return { ...next, lastSubscription: subscriptionOf(next), subscriptionEndedAt: null }
  const { lastSubscription, subscriptionEndedAt } = previous
  return {
    ...next,
    lastSubscription,
    subscriptionEndedAt:
      lastSubscription === null ? null : (subscriptionEndedAt ?? new Date().toISOString()),
  }
}

export const usePurchaseStore = defineStore('purchase', () => {
  const stored = ref<StoredPlusStatus>(readStoredPlusStatus())
  /** Une échéance passée se lit « aucun » ; le stocké reste, pour retrouver un renouvellement. */
  const status = computed<PlusStatus>(() => {
    const { plan, expiresAt } = stored.value
    return expiresAt !== null && Date.parse(expiresAt) <= Date.now() ? NO_PLUS : { plan, expiresAt }
  })
  /** Abonnement échu, que `status` lit déjà « aucun » : de quoi écrire « expiré ». */
  const expiredPlan = computed<SubscriptionPlan | null>(() =>
    status.value.plan === 'none' ? stored.value.lastSubscription : null,
  )
  const available = billingService.isAvailable()
  const offers = ref<PlusOffer[]>([])
  /** Échec du dernier chargement des offres : les autres actions lèvent. */
  const error = ref<Error | null>(null)

  let generation = 0

  function record(next: PlusStatus, previous = stored.value): PlusStatus {
    generation += 1
    stored.value = remember(next, previous)
    writeStoredPlusStatus(stored.value)
    return next
  }

  return {
    status,
    expiredPlan,
    available,
    offers,
    error,

    /** Sans droit payant connu, même échu, ne contacte pas RevenueCat. Ne lève pas. */
    async verifyKnownStatus(): Promise<boolean> {
      if (stored.value.plan === 'none' && stored.value.lastSubscription === null) return true
      const startedAt = generation
      try {
        const next = await billingService.fetchStatus()
        if (generation === startedAt) record(next)
        return true
      } catch (cause) {
        console.warn('Statut Plus non revérifié :', errorSummary(cause))
        return false
      }
    },

    /** Ne lève pas : renvoie `false` et renseigne `error`. */
    async loadOffers(): Promise<boolean> {
      try {
        offers.value = await billingService.listOffers()
        error.value = null
        return true
      } catch (cause) {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
        return false
      }
    },

    async purchase(plan: PaidPlan): Promise<PurchaseOutcome> {
      const outcome = await billingService.purchase(plan)
      if (outcome.kind === 'purchased') record(outcome.status)
      return outcome
    },

    async restore(): Promise<PlusStatus> {
      return record(await billingService.restore())
    },

    /** Le souvenir d'abonnement appartient au compte quitté : le nouveau repart de zéro. */
    async logIn(appUserID: string): Promise<PlusStatus> {
      return record(await billingService.logIn(appUserID), NO_STORED_PLUS)
    },
  }
})
