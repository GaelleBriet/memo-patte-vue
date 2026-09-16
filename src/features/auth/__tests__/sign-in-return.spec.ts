import { describe, expect, it } from 'vitest'

import { accountErrorKey } from '../account-error-message'
import { signInReturnRoute, signInRoute } from '../sign-in-return'
import { routes } from '@/router'

describe('signInRoute', () => {
  it('emporte le parcours d’origine dans l’adresse', () => {
    expect(signInRoute('settings')).toEqual({ name: 'sign-in', query: { from: 'settings' } })
  })

  it('désigne une route déclarée', () => {
    expect(routes.some((route) => route.name === 'sign-in')).toBe(true)
  })

  it('ne déclare pas l’écran comme racine de la barre du bas', () => {
    expect(routes.find((route) => route.name === 'sign-in')?.meta?.rootScreen).toBeUndefined()
  })
})

describe('signInReturnRoute', () => {
  it('ramène au parcours d’origine', () => {
    expect(signInReturnRoute('settings')).toEqual({ name: 'settings' })
  })

  it('se replie sur l’écran Plus quand l’origine est absente ou inconnue', () => {
    expect(signInReturnRoute(undefined)).toEqual({ name: 'plus' })
    expect(signInReturnRoute('animals')).toEqual({ name: 'plus' })
    expect(signInReturnRoute(['settings'])).toEqual({ name: 'plus' })
  })
})

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
