export type AccountErrorReason =
  | 'email-taken'
  | 'invalid-credentials'
  | 'weak-password'
  | 'email-not-confirmed'
  | 'offline'
  | 'unknown'

export class AccountError extends Error {
  override readonly name = 'AccountError'

  constructor(
    readonly reason: AccountErrorReason,
    options?: { cause?: unknown },
  ) {
    super(`Échec du compte : ${reason}`, options)
  }
}
