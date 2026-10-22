// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { GoogleCredentialError } from '@/core/google-sign-in/google-credentials'

import { AccountError } from '../logic/account-error'
import { accountErrorKey, signInErrorKey } from '../logic/account-error-message'

describe('accountErrorKey', () => {
  it('donne un message à chaque raison typée du repository', () => {
    expect(accountErrorKey('email-taken')).toBe('auth.errors.emailTaken')
    expect(accountErrorKey('invalid-credentials')).toBe('auth.errors.invalidCredentials')
    expect(accountErrorKey('weak-password')).toBe('auth.errors.weakPassword')
    expect(accountErrorKey('email-not-confirmed')).toBe('auth.errors.unknown')
    expect(accountErrorKey('invalid-code')).toBe('auth.code.errors.incorrect')
    expect(accountErrorKey('email-rate-limited')).toBe('auth.code.wait')
    expect(accountErrorKey('offline')).toBe('auth.errors.offline')
    expect(accountErrorKey('unknown')).toBe('auth.errors.unknown')
  })
})

describe('signInErrorKey', () => {
  it('garde le message de la raison d’une erreur de compte', () => {
    expect(signInErrorKey(new AccountError('offline'))).toBe('auth.errors.offline')
  })

  it('dit qu’aucun compte Google n’est sur le téléphone', () => {
    expect(signInErrorKey(new GoogleCredentialError('no-google-account'))).toBe(
      'auth.errors.noGoogleAccount',
    )
  })

  it('dit que la connexion Google est indisponible', () => {
    expect(signInErrorKey(new GoogleCredentialError('unavailable'))).toBe(
      'auth.errors.googleUnavailable',
    )
  })

  it('retombe sur le message générique pour un autre échec Google ou une erreur inconnue', () => {
    expect(signInErrorKey(new GoogleCredentialError('failed'))).toBe('auth.errors.unknown')
    expect(signInErrorKey(new Error('boom'))).toBe('auth.errors.unknown')
  })
})
