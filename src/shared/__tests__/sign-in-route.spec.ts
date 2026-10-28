import { describe, expect, it } from 'vitest'

import {
  accountFirstRoute,
  afterSignInRoute,
  asksSignUp,
  helpBackRoute,
  isHelpRoute,
  helpRoute,
  passwordResetRoute,
  signInReturnRoute,
  signInRoute,
  signInRouteFrom,
} from '../utils/sign-in-route'
import { routes } from '@/router'

const SUMMARY = { animalCount: 2, lastBackupAt: '2026-10-20T19:04:00.000Z' }

describe('signInRoute', () => {
  it('emporte le parcours d’origine dans l’adresse', () => {
    expect(signInRoute('settings')).toEqual({ name: 'sign-in', query: { from: 'settings' } })
  })

  it('marque une connexion qui mène à la restauration du carnet', () => {
    expect(signInRoute('home', { restore: true })).toEqual({
      name: 'sign-in',
      query: { from: 'home', restore: '1' },
    })
  })

  it('ouvre l’écran en mode inscription quand on vient créer un compte', () => {
    expect(signInRoute('plus-account', { signUp: true })).toEqual({
      name: 'sign-in',
      query: { from: 'plus-account', mode: 'sign-up' },
    })
  })

  it('désigne une route déclarée', () => {
    expect(routes.some((route) => route.name === 'sign-in')).toBe(true)
  })

  it('ne déclare pas l’écran comme racine de la barre du bas', () => {
    expect(routes.find((route) => route.name === 'sign-in')?.meta?.rootScreen).toBeUndefined()
  })
})

describe('passwordResetRoute', () => {
  it('garde le parcours d’origine et passe l’adresse par l’historique, jamais par l’adresse de l’écran', () => {
    expect(
      passwordResetRoute(
        { from: 'plus-account', restore: '1', mode: 'sign-up' },
        'sophie@exemple.fr',
      ),
    ).toEqual({
      name: 'password-reset',
      query: { from: 'plus-account', restore: '1' },
      state: { email: 'sophie@exemple.fr' },
    })
  })

  it('verrouille l’adresse à la demande', () => {
    expect(
      passwordResetRoute({ from: 'settings' }, 'sophie@exemple.fr', { emailLocked: true }),
    ).toEqual({
      name: 'password-reset',
      query: { from: 'settings' },
      state: { email: 'sophie@exemple.fr', emailLocked: true },
    })
  })

  it('désigne une route déclarée, poussée', () => {
    const route = routes.find(({ name }) => name === 'password-reset')
    expect(route).toBeDefined()
    expect(route?.meta?.rootScreen).toBeUndefined()
  })
})

describe('signInRouteFrom', () => {
  it('revient à la connexion avec le même parcours d’origine', () => {
    expect(signInRouteFrom({ from: 'settings', restore: '1' })).toEqual({
      name: 'sign-in',
      query: { from: 'settings', restore: '1' },
    })
    expect(signInRouteFrom({})).toEqual({ name: 'sign-in', query: {} })
  })
})

describe('asksSignUp', () => {
  it('ne lit le mode inscription que dans l’adresse prévue', () => {
    expect(asksSignUp({ from: 'plus-account', mode: 'sign-up' })).toBe(true)
    expect(asksSignUp({ from: 'plus-account' })).toBe(false)
    expect(asksSignUp({ mode: ['sign-up'] })).toBe(false)
  })
})

describe('accountFirstRoute', () => {
  it('désigne « Étape 1 sur 2 », écran poussé déclaré', () => {
    const route = routes.find((candidate) => candidate.name === 'plus-account')

    expect(accountFirstRoute()).toEqual({ name: 'plus-account' })
    expect(route).toBeDefined()
    expect(route?.meta?.rootScreen).toBeUndefined()
  })
})

describe('signInReturnRoute', () => {
  it('ramène au parcours d’origine', () => {
    expect(signInReturnRoute('plus-account')).toEqual({ name: 'plus-account' })
    expect(signInReturnRoute('settings')).toEqual({ name: 'settings' })
    expect(signInReturnRoute('settings-plus')).toEqual({ name: 'settings-plus' })
    expect(signInReturnRoute('home')).toEqual({ name: 'home' })
    expect(signInReturnRoute('settings-account')).toEqual({ name: 'settings-account' })
    expect(signInReturnRoute('settings-backup')).toEqual({ name: 'settings-backup' })
  })

  it('se replie sur l’écran Plus quand l’origine est absente ou inconnue', () => {
    expect(signInReturnRoute(undefined)).toEqual({ name: 'plus' })
    expect(signInReturnRoute('carnet')).toEqual({ name: 'plus' })
    expect(signInReturnRoute(['settings'])).toEqual({ name: 'plus' })
  })
})

describe('afterSignInRoute', () => {
  it('sans restauration demandée, ramène au parcours d’origine', () => {
    expect(afterSignInRoute({ from: 'settings' }, { step: 'choice', summary: SUMMARY })).toEqual({
      name: 'settings',
    })
  })

  it('sans sauvegarde à restaurer, ramène à l’écran d’origine', () => {
    expect(afterSignInRoute({ from: 'home', restore: '1' }, { step: 'idle' })).toEqual({
      name: 'home',
    })
  })

  it('ouvre « Restaurer mon carnet » pour le choix, la progression ou l’attente du réseau', () => {
    const query = { from: 'settings-plus', restore: '1' }
    const restore = { name: 'account-restore', query: { from: 'settings-plus' } }

    expect(afterSignInRoute(query, { step: 'choice', summary: SUMMARY })).toEqual(restore)
    expect(afterSignInRoute(query, { step: 'restoring', progress: { done: 0, total: 0 } })).toEqual(
      restore,
    )
    expect(afterSignInRoute(query, { step: 'waiting-network', chosen: true })).toEqual(restore)
    expect(afterSignInRoute(query, { step: 'done' })).toEqual(restore)
    expect(
      afterSignInRoute(query, { step: 'send-confirmation', animalCount: 1, firstName: 'Milo' }),
    ).toEqual(restore)
  })

  it('reste sur la connexion quand le serveur n’a pas répondu à temps', () => {
    expect(afterSignInRoute({ from: 'home', restore: '1' }, { step: 'no-answer' })).toBeNull()
  })
})

describe('helpRoute et helpBackRoute', () => {
  it('l’aide emporte l’écran qui l’ouvre dans l’adresse', () => {
    expect(helpRoute('settings-backup')).toEqual({
      name: 'settings-help',
      query: { from: 'settings-backup' },
    })
  })

  it('la flèche de l’aide ramène à l’écran d’origine connu', () => {
    expect(helpBackRoute('settings-backup')).toEqual({ name: 'settings-backup' })
    expect(helpBackRoute('settings-account-email')).toEqual({ name: 'settings-account-email' })
  })

  it('l’aide n’emprunte pas la liste des retours de la connexion', () => {
    expect(helpBackRoute('plus-account')).toEqual({ name: 'settings' })
    expect(helpBackRoute('home')).toEqual({ name: 'settings' })
    expect(signInReturnRoute('settings-account-email')).toEqual({ name: 'plus' })
  })

  it.each([
    '//evil.com',
    'http://evil.com',
    '__proto__',
    'constructor',
    'Settings-Backup',
    'settings-backup ',
    'settings-help',
    'x'.repeat(100_000),
  ])('une origine fabriquée retombe sur les Paramètres : %s', (from) => {
    expect(helpBackRoute(from)).toEqual({ name: 'settings' })
  })

  it('se replie sur la liste des Paramètres quand l’origine est absente, inconnue ou libre', () => {
    expect(helpBackRoute(undefined)).toEqual({ name: 'settings' })
    expect(helpBackRoute('https://exemple.fr')).toEqual({ name: 'settings' })
    expect(helpBackRoute(['settings-backup'])).toEqual({ name: 'settings' })
  })
})

describe('isHelpRoute', () => {
  it('reconnaît la route d’Aide et contact, et elle seule', () => {
    expect(isHelpRoute('settings-help')).toBe(true)
    expect(isHelpRoute('settings-account-email')).toBe(false)
    expect(isHelpRoute(undefined)).toBe(false)
  })
})
