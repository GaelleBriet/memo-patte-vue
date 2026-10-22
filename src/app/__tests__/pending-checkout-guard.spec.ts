import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { installPendingCheckoutGuard } from '../pending-checkout-guard'

const Vide = { render: () => null }

async function routeur() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Vide },
      { path: '/plus', name: 'plus', component: Vide },
      { path: '/plus/account', name: 'plus-account', component: Vide },
      { path: '/sign-in', name: 'sign-in', component: Vide },
      { path: '/settings/plus', name: 'settings-plus', component: Vide },
      { path: '/settings', name: 'settings', component: Vide },
    ],
  })
  await router.push('/plus')
  const forget = vi.fn<() => void>()
  const forgetRestore = vi.fn<() => void>()
  installPendingCheckoutGuard(router, { checkout: forget, restore: forgetRestore })
  return { router, forget, forgetRestore }
}

describe('installPendingCheckoutGuard', () => {
  it('garde l’offre choisie le long du parcours d’achat : étape 1, connexion, écran Plus', async () => {
    const { router, forget } = await routeur()

    await router.push('/plus/account')
    await router.push('/sign-in')
    await router.push('/plus/account')
    await router.push('/plus')

    expect(forget).not.toHaveBeenCalled()
  })

  it('l’oublie dès qu’on sort du parcours, par exemple vers l’accueil poussé par un rappel', async () => {
    const { router, forget } = await routeur()
    await router.push('/plus/account')

    await router.push('/')

    expect(forget).toHaveBeenCalledOnce()
  })

  it('l’oublie aussi en arrivant sur Paramètres › Plus', async () => {
    const { router, forget } = await routeur()
    await router.push('/sign-in')

    await router.push('/settings/plus')

    expect(forget).toHaveBeenCalledOnce()
  })

  it('ne l’oublie pas pour une navigation refusée', async () => {
    const { router, forget } = await routeur()
    router.beforeEach((to) => to.name !== 'home')

    await router.push('/')

    expect(forget).not.toHaveBeenCalled()
  })

  it('garde la demande de restauration entre l’écran Plus, Paramètres › Plus et la connexion', async () => {
    const { router, forgetRestore } = await routeur()

    await router.push('/sign-in')
    await router.push('/settings/plus')
    await router.push('/sign-in')
    await router.push('/plus')

    expect(forgetRestore).not.toHaveBeenCalled()
  })

  it('oublie la demande de restauration hors de ces écrans', async () => {
    const { router, forgetRestore } = await routeur()
    await router.push('/sign-in')

    await router.push('/settings')

    expect(forgetRestore).toHaveBeenCalledOnce()
  })
})
