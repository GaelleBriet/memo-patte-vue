import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'

import { returnTo } from '../utils/return-to'
import {
  passwordResetBackRoute,
  passwordResetRoute,
  signInReturnRoute,
} from '../utils/sign-in-route'

const Vide = { render: () => null }

beforeEach(() => window.history.replaceState(null, '', '/'))

async function depuisChangerMonMotDePasse() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/settings', name: 'settings', component: Vide },
      { path: '/settings/account', name: 'settings-account', component: Vide },
      { path: '/settings/account/password', name: 'settings-account-password', component: Vide },
      { path: '/sign-in', name: 'sign-in', component: Vide },
      { path: '/sign-in/password-reset', name: 'password-reset', component: Vide },
    ],
  })
  for (const path of ['/settings', '/settings/account', '/settings/account/password']) {
    await router.push(path)
  }
  await router.replace(
    passwordResetRoute({ from: 'settings-account' }, 'sophie@exemple.fr', { emailLocked: true }),
  )
  return router
}

describe('« Mot de passe oublié ? » depuis « Changer mon mot de passe »', () => {
  it('après le nouveau mot de passe, revient à Compte ; le retour arrière ramène aux Paramètres', async () => {
    const router = await depuisChangerMonMotDePasse()

    returnTo(router, signInReturnRoute('settings-account'))
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('settings-account'))

    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('settings'))
  })

  it('la flèche revient à « Changer mon mot de passe », jamais à la connexion', async () => {
    const router = await depuisChangerMonMotDePasse()

    returnTo(router, passwordResetBackRoute(router.currentRoute.value.query))
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('settings-account-password'))

    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('settings-account'))
  })
})

describe('passwordResetBackRoute', () => {
  it('revient à la connexion, avec son parcours, depuis la connexion', () => {
    expect(passwordResetBackRoute({ from: 'plus-account', restore: '1' })).toEqual({
      name: 'sign-in',
      query: { from: 'plus-account', restore: '1' },
    })
  })
})
