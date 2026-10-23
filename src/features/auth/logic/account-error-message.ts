import { GoogleCredentialError } from '@/core/google-sign-in/google-credentials'

import { AccountError, type AccountErrorReason } from './account-error'

const MESSAGE_KEYS: Record<AccountErrorReason, string> = {
  'email-taken': 'auth.errors.emailTaken',
  'invalid-credentials': 'auth.errors.invalidCredentials',
  'weak-password': 'auth.errors.weakPassword',
  'same-password': 'auth.errors.samePassword',
  'email-not-confirmed': 'auth.errors.unknown',
  'invalid-code': 'auth.code.errors.incorrect',
  'email-rate-limited': 'auth.code.wait',
  offline: 'auth.errors.offline',
  unknown: 'auth.errors.unknown',
}

export const WRONG_PASSWORD_KEY = 'settings.account.delete.identity.wrongPassword'

export function isWrongPassword(cause: unknown): boolean {
  return cause instanceof AccountError && cause.reason === 'invalid-credentials'
}

export function accountErrorKey(reason: AccountErrorReason): string {
  return MESSAGE_KEYS[reason]
}

export function signInErrorKey(cause: unknown): string {
  if (cause instanceof AccountError) return accountErrorKey(cause.reason)
  if (cause instanceof GoogleCredentialError) {
    if (cause.reason === 'no-google-account') return 'auth.errors.noGoogleAccount'
    if (cause.reason === 'unavailable') return 'auth.errors.googleUnavailable'
  }
  return accountErrorKey('unknown')
}
