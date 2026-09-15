import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  billingService,
  type PaidPlan,
  type PlusOffer,
  type PurchaseOutcome,
} from './billing.service'
import type { PlusStatus } from './plus-status'
import { readStoredPlusStatus, writeStoredPlusStatus } from './plus-status-storage'

export const usePurchaseStore = defineStore('purchase', () => {
  const status = ref<PlusStatus>(readStoredPlusStatus())
  const offers = ref<PlusOffer[]>([])
  /** Échec du dernier chargement des offres : les autres actions lèvent. */
  const error = ref<Error | null>(null)

  function record(next: PlusStatus): PlusStatus {
    status.value = next
    writeStoredPlusStatus(next)
    return next
  }

  return {
    status,
    offers,
    error,

    /** Sans statut Plus connu, ne contacte pas RevenueCat. Ne lève pas. */
    async verifyKnownStatus(): Promise<boolean> {
      if (status.value.plan === 'none') return true
      try {
        record(await billingService.fetchStatus())
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
