import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { createRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { installRestorePrompt } from '../restore-prompt'

const Vide = { render: () => null }
const SUMMARY = { animalCount: 2, lastBackupAt: '2026-10-20T19:04:00.000Z' }

function routeur(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Vide },
      { path: '/animals', name: 'carnet', component: Vide },
      { path: '/restore', name: 'account-restore', component: Vide },
    ],
  })
}

function parcours(): RestoreFlow {
  return createRestoreFlow({
    pendingMode: async () => null,
    start: async () => {},
    run: async () => 'restored',
    progress: { done: 0, total: 0 },
    onProgress: () => () => {},
  })
}

let uninstall = () => {}

afterEach(() => {
  uninstall()
  vi.restoreAllMocks()
})

describe('installRestorePrompt', () => {
  it('ouvre « Restaurer mon carnet » depuis l’accueil quand une sauvegarde est trouvée', async () => {
    const router = routeur()
    const flow = parcours()
    await router.push('/')
    uninstall = installRestorePrompt(router, () => flow)

    flow.offer(SUMMARY)
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('account-restore')
    expect(router.currentRoute.value.query).toEqual({ from: 'home' })
  })

  it('attend le passage par l’accueil pour l’ouvrir', async () => {
    const router = routeur()
    const flow = parcours()
    await router.push('/animals')
    uninstall = installRestorePrompt(router, () => flow)

    flow.offer(SUMMARY)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('carnet')

    await router.push('/')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('account-restore')
  })

  it('ne revient qu’une fois par lancement tant qu’aucun choix n’est fait', async () => {
    const router = routeur()
    const flow = parcours()
    await router.push('/')
    uninstall = installRestorePrompt(router, () => flow)
    flow.offer(SUMMARY)
    await flushPromises()

    await router.push('/')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('home')
  })

  it('compte l’écran déjà ouvert par la connexion comme proposé', async () => {
    const router = routeur()
    const flow = parcours()
    await router.push('/')
    uninstall = installRestorePrompt(router, () => flow)
    await router.push('/restore')
    flow.offer(SUMMARY)
    await flushPromises()

    await router.push('/')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('home')
  })

  it('propose de nouveau pour un autre compte', async () => {
    const router = routeur()
    const flow = parcours()
    await router.push('/')
    uninstall = installRestorePrompt(router, () => flow)
    flow.offer(SUMMARY)
    await flushPromises()
    await router.push('/')

    flow.reset()
    await flushPromises()
    flow.offer(SUMMARY)
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('account-restore')
  })
})
