import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  billingService,
  type PaidPlan,
  type PlusOffer,
  type PurchaseOutcome,
} from '../service/billing.service'
import {
  NO_PLUS,
  subscriptionOf,
  type PlusStatus,
  type SubscriptionPlan,
} from '../logic/plus-status'
import { pausedBackupOf, type BackupPause } from '../logic/plus-pause'
import { clearPlusEndedAt, readPlusEndedAt } from '../logic/plus-pause-storage'
import {
  NO_STORED_PLUS,
  readStoredPlusStatus,
  writeStoredPlusStatus,
  type StoredPlusStatus,
} from '../logic/plus-status-storage'
import { track } from '@/core/analytics'
import { errorSummary } from '@/shared/utils/error-summary'

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
  /** Instant de la dernière vérification : l'échéance se relit à chacune. */
  const now = ref(Date.now())
  /** Une échéance passée se lit « aucun » ; le stocké reste, pour retrouver un renouvellement. */
  const status = computed<PlusStatus>(() => {
    const { plan, expiresAt, offered } = stored.value
    if (expiresAt !== null && Date.parse(expiresAt) <= now.value) return NO_PLUS
    return offered ? { plan, expiresAt, offered } : { plan, expiresAt }
  })
  /** Abonnement échu, que `status` lit déjà « aucun » : de quoi écrire « expiré ». */
  const expiredPlan = computed<SubscriptionPlan | null>(() =>
    status.value.plan === 'none' ? stored.value.lastSubscription : null,
  )
  const endedAt = ref<string | null>(readPlusEndedAt())
  /** Plus arrêté et sauvegarde cloud encore conservée : 12 mois, là où `expiredPlan` n'en tient que 1. */
  const backupPause = computed<BackupPause | null>(() =>
    pausedBackupOf({
      status: status.value,
      expiredPlan: expiredPlan.value,
      endedAt: endedAt.value,
      now: now.value,
    }),
  )
  const available = billingService.isAvailable()
  const offers = ref<PlusOffer[]>([])
  /** Échec du dernier chargement des offres : les autres actions lèvent. */
  const error = ref<Error | null>(null)
  /** Offre choisie avant d'avoir un compte : le paiement reprend une fois le compte ouvert. */
  const pendingCheckout = ref<PaidPlan | null>(null)
  /** « Restaurer mes achats » touché avant d'avoir un compte : la restauration reprend après. */
  let pendingRestore = false

  let generation = 0

  function record(next: PlusStatus, previous = stored.value): PlusStatus {
    generation += 1
    stored.value = remember(next, previous)
    writeStoredPlusStatus(stored.value)
    endedAt.value = readPlusEndedAt()
    return next
  }

  return {
    status,
    expiredPlan,
    backupPause,
    available,
    offers,
    error,
    pendingCheckout,

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
      } finally {
        now.value = Date.now()
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
      if (outcome.kind === 'purchased') {
        record(outcome.status)
        track('purchase_completed', { plan })
      }
      return outcome
    },

    rememberCheckout(plan: PaidPlan): void {
      pendingCheckout.value = plan
    },

    forgetCheckout(): void {
      pendingCheckout.value = null
    },

    rememberRestore(): void {
      pendingRestore = true
    },

    forgetRestore(): void {
      pendingRestore = false
    },

    takePendingRestore(): boolean {
      const asked = pendingRestore
      pendingRestore = false
      return asked
    },

    takePendingCheckout(): PaidPlan | null {
      const plan = pendingCheckout.value
      pendingCheckout.value = null
      return plan
    },

    async restore(): Promise<PlusStatus> {
      return record(await billingService.restore())
    },

    /** L'appareil garde son droit : seul `reset()` solde le souvenir du compte quitté. */
    async logIn(appUserID: string): Promise<PlusStatus> {
      const startedAt = generation
      const next = await billingService.logIn(appUserID)
      return generation === startedAt ? record(next) : status.value
    },

    /** Le compte quitté n'emporte ni son droit ni le souvenir de son abonnement. */
    reset(): void {
      pendingCheckout.value = null
      pendingRestore = false
      record(NO_PLUS, NO_STORED_PLUS)
      endedAt.value = null
      clearPlusEndedAt()
    },

    /**
     * Détache l'app-user RevenueCat, et laisse le statut enregistré intact : l'achat est celui de
     * l'appareil. Sans effet tant qu'un droit payant est connu, même échu, car l'utilisateur
     * anonyme créé à sa place n'a aucun achat et la revérification effacerait ce droit.
     */
    async logOut(): Promise<void> {
      pendingCheckout.value = null
      pendingRestore = false
      if (stored.value.plan !== 'none' || stored.value.lastSubscription !== null) return
      await billingService.logOut()
    },
  }
})
