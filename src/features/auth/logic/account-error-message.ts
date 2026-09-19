import type { AccountErrorReason } from './account-error'

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
