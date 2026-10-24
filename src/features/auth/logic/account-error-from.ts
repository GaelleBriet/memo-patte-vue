import { AccountError, type AccountErrorReason } from './account-error'

type SupabaseErrorShape = { name?: string; status?: number; code?: string }

const REASONS_BY_CODE: Record<string, AccountErrorReason> = {
  email_exists: 'email-taken',
  user_already_exists: 'email-taken',
  invalid_credentials: 'invalid-credentials',
  current_password_invalid: 'invalid-credentials',
  current_password_mismatch: 'invalid-credentials',
  weak_password: 'weak-password',
  same_password: 'same-password',
  email_not_confirmed: 'email-not-confirmed',
  otp_expired: 'invalid-code',
  over_email_send_rate_limit: 'email-rate-limited',
}

export function accountErrorFrom(cause: unknown): AccountError {
  if (cause instanceof AccountError) return cause
  const { name, status, code } = (cause ?? {}) as SupabaseErrorShape
  if (name === 'AuthRetryableFetchError' && status === 0) {
    return new AccountError('offline', { cause })
  }
  const reason =
    code !== undefined && Object.hasOwn(REASONS_BY_CODE, code) ? REASONS_BY_CODE[code] : undefined
  return new AccountError(reason ?? 'unknown', { cause })
}
