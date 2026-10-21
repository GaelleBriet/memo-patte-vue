import { GoogleCredentialError } from '@/core/google-sign-in/google-credentials'

import { AccountError, type AccountErrorReason } from './account-error'

const MESSAGE_KEYS: Record<AccountErrorReason, string> = {
  'email-taken': 'auth.errors.emailTaken',
  'invalid-credentials': 'auth.errors.invalidCredentials',
  'weak-password': 'auth.errors.weakPassword',
  'email-not-confirmed': 'auth.errors.emailNotConfirmed',
  offline: 'auth.errors.offline',
  unknown: 'auth.errors.unknown',
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
