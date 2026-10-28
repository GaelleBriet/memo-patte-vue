import type { usePurchaseStore } from '@/features/purchase/store/purchase.store'

type PlusStatus = ReturnType<typeof usePurchaseStore>['status']

export type AccountDeletionPurchase = {
  note: { summary: string; finalConfirm: string } | null
  managesInGooglePlay: boolean
}

export function accountDeletionPurchase(status: PlusStatus): AccountDeletionPurchase {
  if (status.offered) return { note: null, managesInGooglePlay: false }
  if (status.plan === 'lifetime')
    return {
      note: {
        summary: 'settings.account.delete.lifetime',
        finalConfirm: 'settings.account.delete.lifetime',
      },
      managesInGooglePlay: false,
    }
  return {
    note: {
      summary: 'settings.account.delete.subscription',
      finalConfirm: 'settings.account.delete.finalConfirm.subscription',
    },
    managesInGooglePlay: true,
  }
}
