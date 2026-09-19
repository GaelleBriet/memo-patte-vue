// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { accountErrorKey } from '../logic/account-error-message'

describe('accountErrorKey', () => {
  it('donne un message à chaque raison typée du repository', () => {
    expect(accountErrorKey('email-taken')).toBe('auth.errors.emailTaken')
    expect(accountErrorKey('invalid-credentials')).toBe('auth.errors.invalidCredentials')
    expect(accountErrorKey('weak-password')).toBe('auth.errors.weakPassword')
    expect(accountErrorKey('email-not-confirmed')).toBe('auth.errors.emailNotConfirmed')
    expect(accountErrorKey('offline')).toBe('auth.errors.offline')
    expect(accountErrorKey('unknown')).toBe('auth.errors.unknown')
  })
})
