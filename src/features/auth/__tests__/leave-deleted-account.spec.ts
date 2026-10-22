import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebHistory, createRouter } from 'vue-router'

import { leaveDeletedAccount } from '../logic/leave-deleted-account'

beforeEach(() => window.history.replaceState(null, '', '/'))

const Vide = { render: () => null }

async function routeur(path: string[]) {
  let hasAccount = true
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/animals', name: 'carnet', component: Vide },
      { path: '/settings', name: 'settings', component: Vide },
      { path: '/settings/plus', name: 'settings-plus', component: Vide },
      {
        path: '/settings/account',
        name: 'settings-account',
        component: Vide,
        beforeEnter: () => (hasAccount ? true : { name: 'settings-plus' }),
      },
      { path: '/settings/account/delete', name: 'settings-account-delete', component: Vide },
    ],
  })
  for (const entry of path) await router.push(entry)
  return { router, deleteAccount: () => (hasAccount = false) }
}

describe('leaveDeletedAccount', () => {
  it('ramène aux Paramètres sans laisser l’écran Compte derrière : le retour arrière ne le rouvre pas', async () => {
    const { router, deleteAccount } = await routeur([
      '/animals',
      '/settings',
      '/settings/account',
      '/settings/account/delete',
    ])
    deleteAccount()

    leaveDeletedAccount(router)
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('settings'))

    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('carnet'))
  })

  it('remplace seulement l’écran quand le Compte n’est pas l’écran précédent', async () => {
    const { router } = await routeur(['/animals', '/settings', '/settings/account/delete'])

    leaveDeletedAccount(router)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('settings')
    expect(router.options.history.state.back).toBe('/settings')
  })
})
