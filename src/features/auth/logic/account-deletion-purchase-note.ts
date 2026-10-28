import type { usePurchaseStore } from '@/features/purchase/store/purchase.store'

type PlusStatus = ReturnType<typeof usePurchaseStore>['status']

export type AccountDeletionPurchaseNote = { summary: string; finalConfirm: string }

export function accountDeletionPurchaseNote(
  status: PlusStatus,
): AccountDeletionPurchaseNote | null {
  if (status.offered) return null
  if (status.plan === 'lifetime')
    return {
      summary: 'settings.account.delete.lifetime',
      finalConfirm: 'settings.account.delete.lifetime',
    }
  return {
    summary: 'settings.account.delete.subscription',
    finalConfirm: 'settings.account.delete.finalConfirm.subscription',
  }
}
