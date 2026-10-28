import type { usePurchaseStore } from '@/features/purchase/store/purchase.store'

type PlusStatus = ReturnType<typeof usePurchaseStore>['status']

export type AccountDeletionPurchase = {
  note: { summary: string; finalConfirm: string } | null
  managesInGooglePlay: boolean
  keepsPurchaseHistory: boolean
}

export function accountDeletionPurchase(
  status: PlusStatus,
  offeredEnded = false,
): AccountDeletionPurchase {
  if (status.offered || offeredEnded)
    return { note: null, managesInGooglePlay: false, keepsPurchaseHistory: false }
  if (status.plan === 'lifetime')
    return {
      note: {
        summary: 'settings.account.delete.lifetime',
        finalConfirm: 'settings.account.delete.lifetime',
      },
      managesInGooglePlay: false,
      keepsPurchaseHistory: true,
    }
  return {
    note: {
      summary: 'settings.account.delete.subscription',
      finalConfirm: 'settings.account.delete.finalConfirm.subscription',
    },
    managesInGooglePlay: true,
    keepsPurchaseHistory: true,
  }
}
