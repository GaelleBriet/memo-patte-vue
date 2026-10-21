export type AccountDeletionFailure = 'identity-expired' | 'failed'

export class AccountDeletionError extends Error {
  override readonly name = 'AccountDeletionError'

  constructor(
    readonly reason: AccountDeletionFailure,
    options?: { cause?: unknown },
  ) {
    super(`Suppression du compte impossible : ${reason}`, options)
  }
}
