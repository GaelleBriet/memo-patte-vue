import { ref } from 'vue'

import { errorSummary } from '@/shared/utils/error-summary'

import { AccountDeletionError } from '../logic/account-deletion-error'
import { isWrongPassword, signInErrorKey, WRONG_PASSWORD_KEY } from '../logic/account-error-message'
import type { IdentityConfirmationMethod } from '../repository/account-deletion.repository'
import {
  createAccountDeletionService,
  type AccountDeletionService,
} from '../service/account-deletion.service'
import { useAuthStore } from '../store/auth.store'

export type AccountDeletionStep =
  'explain' | 'confirm-identity' | 'final-confirm' | 'deleting' | 'deleted' | 'failed'

export type IdentityError = { key: string; params?: Record<string, string> }

type Resumption = 'method' | 'identity' | 'deletion'

function defaultService(): AccountDeletionService {
  const auth = useAuthStore()
  return createAccountDeletionService({ forgetAccountOnDevice: () => auth.forgetDeletedAccount() })
}

/** D1 à D6 : ce qui change, l'identité, la confirmation finale, puis la suppression. */
export function useAccountDeletion(service: AccountDeletionService = defaultService()) {
  const step = ref<AccountDeletionStep>('explain')
  const method = ref<IdentityConfirmationMethod | null>(null)
  const identityError = ref<IdentityError | null>(null)
  const isConfirming = ref(false)

  let resumption: Resumption = 'method'

  function identityErrorOf(cause: unknown): IdentityError {
    if (isWrongPassword(cause)) return { key: WRONG_PASSWORD_KEY }
    return { key: signInErrorKey(cause) }
  }

  async function proceed(): Promise<void> {
    try {
      method.value = await service.confirmationMethod()
      identityError.value = null
      step.value = 'confirm-identity'
    } catch (cause) {
      console.warn('Confirmation d’identité illisible :', errorSummary(cause))
      resumption = 'method'
      step.value = 'failed'
    }
  }

  async function confirm(attempt: () => Promise<IdentityError | 'confirmed' | null>) {
    if (isConfirming.value) return
    isConfirming.value = true
    identityError.value = null
    try {
      const outcome = await attempt()
      if (outcome === 'confirmed') step.value = 'final-confirm'
      else identityError.value = outcome
    } catch (cause) {
      identityError.value = identityErrorOf(cause)
    } finally {
      isConfirming.value = false
    }
  }

  async function confirmWithPassword(password: string): Promise<void> {
    if (password === '') return
    await confirm(async () => {
      await service.confirmWithPassword(password)
      return 'confirmed'
    })
  }

  async function confirmWithGoogle(): Promise<void> {
    const expected = method.value
    if (expected?.kind !== 'google') return
    await confirm(async () => {
      const outcome = await service.confirmWithGoogle(expected)
      if (outcome.kind === 'confirmed') return 'confirmed'
      if (outcome.kind === 'cancelled') return null
      return {
        key: 'settings.account.delete.identity.otherGoogleAccount',
        params: { email: outcome.expectedEmail },
      }
    })
  }

  function cancelFinalConfirmation(): void {
    step.value = 'explain'
  }

  async function deleteAccount(): Promise<void> {
    if (step.value === 'deleting') return
    step.value = 'deleting'
    try {
      await service.deleteAccount()
      step.value = 'deleted'
    } catch (cause) {
      const expired = cause instanceof AccountDeletionError && cause.reason === 'identity-expired'
      resumption = expired ? 'identity' : 'deletion'
      step.value = 'failed'
    }
  }

  async function retry(): Promise<void> {
    if (resumption === 'method') await proceed()
    else if (resumption === 'identity') {
      identityError.value = null
      step.value = 'confirm-identity'
    } else await deleteAccount()
  }

  /** `false` : le parcours se quitte. */
  function back(): boolean {
    if (step.value !== 'confirm-identity') return false
    identityError.value = null
    step.value = 'explain'
    return true
  }

  return {
    step,
    method,
    identityError,
    isConfirming,
    proceed,
    confirmWithPassword,
    confirmWithGoogle,
    cancelFinalConfirmation,
    deleteAccount,
    retry,
    back,
  }
}
