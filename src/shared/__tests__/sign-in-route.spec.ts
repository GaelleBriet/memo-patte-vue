import { describe, expect, it } from 'vitest'

import { afterSignInRoute, signInReturnRoute, signInRoute } from '../utils/sign-in-route'
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
    expect(signInReturnRoute('settings-plus')).toEqual({ name: 'settings-plus' })
    expect(signInReturnRoute('home')).toEqual({ name: 'home' })
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
    expect(afterSignInRoute(query, { step: 'waiting-network' })).toEqual(restore)
    expect(afterSignInRoute(query, { step: 'done' })).toEqual(restore)
  })

  it('reste sur la connexion quand le serveur n’a pas répondu à temps', () => {
    expect(afterSignInRoute({ from: 'home', restore: '1' }, { step: 'no-answer' })).toBeNull()
  })
})
