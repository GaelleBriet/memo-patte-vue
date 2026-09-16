import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  billingService,
  type PaidPlan,
  type PlusOffer,
  type PurchaseOutcome,
} from './billing.service'
import { NO_PLUS, type PlusStatus } from './plus-status'
import { readStoredPlusStatus, writeStoredPlusStatus } from './plus-status-storage'

export const usePurchaseStore = defineStore('purchase', () => {
  const stored = ref<PlusStatus>(readStoredPlusStatus())
  /** Une échéance passée se lit « aucun » ; le stocké reste, pour retrouver un renouvellement. */
  const status = computed<PlusStatus>(() => {
    const { expiresAt } = stored.value
    return expiresAt !== null && Date.parse(expiresAt) <= Date.now() ? NO_PLUS : stored.value
  })
  /** Plan d'un abonnement échu, que `status` lit déjà « aucun » : de quoi écrire « expiré ». */
  const expiredPlan = computed<PaidPlan | null>(() => {
    const { plan } = stored.value
    return status.value.plan === 'none' && plan !== 'none' ? plan : null
  })
  const available = billingService.isAvailable()
  const offers = ref<PlusOffer[]>([])
  /** Échec du dernier chargement des offres : les autres actions lèvent. */
  const error = ref<Error | null>(null)

  let generation = 0

  function record(next: PlusStatus): PlusStatus {
    generation += 1
    stored.value = next
    writeStoredPlusStatus(next)
    return next
  }

  return {
    status,
    expiredPlan,
    available,
    offers,
    error,

    /** Sans statut Plus connu, ne contacte pas RevenueCat. Ne lève pas. */
    async verifyKnownStatus(): Promise<boolean> {
      if (stored.value.plan === 'none') return true
      const startedAt = generation
      try {
        const next = await billingService.fetchStatus()
        if (generation === startedAt) record(next)
        return true
      } catch (cause) {
        console.warn('Statut Plus non revérifié :', cause)
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

    async logIn(appUserID: string): Promise<PlusStatus> {
      return record(await billingService.logIn(appUserID))
    },
  }
})
