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
      { path: '/weight', name: 'weight', component: Vide },
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

  describe('« Remplacer » abandonné parce que le carnet du téléphone a changé', () => {
    function parcoursCoupé() {
      const reseau = { online: false }
      let pending: 'replace' | null = null
      const flow = createRestoreFlow({
        pendingMode: async () => pending,
        start: async () => {
          pending = 'replace'
        },
        run: async () => {
          if (!reseau.online) throw new Error('réseau coupé')
          pending = null
          return 'carnet-changed'
        },
        progress: { done: 0, total: 0 },
        onProgress: () => () => {},
      })
      flow.onRetryCheck(() => flow.offer(SUMMARY))
      return { flow, reseau }
    }

    async function remplacerPuisPlusTard(router: Router, flow: RestoreFlow): Promise<void> {
      await router.push('/')
      uninstall = installRestorePrompt(router, () => flow)
      flow.offer(SUMMARY)
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      await flow.choose('replace')
      expect(flow.state.value.step).toBe('waiting-network')
      await router.replace('/')
      await router.push('/weight')
    }

    it('rouvre l’écran au passage suivant par l’accueil, dans le même lancement', async () => {
      const router = routeur()
      const { flow, reseau } = parcoursCoupé()
      await remplacerPuisPlusTard(router, flow)

      reseau.online = true
      await flow.resume()
      await flushPromises()
      expect(flow.state.value.step).toBe('choice')
      expect(router.currentRoute.value.name).toBe('weight')

      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
    })

    it('choix revenu pendant que l’accueil est affiché : attend la prochaine arrivée sur l’accueil', async () => {
      const router = routeur()
      const { flow, reseau } = parcoursCoupé()
      await remplacerPuisPlusTard(router, flow)
      await router.push('/')

      reseau.online = true
      await flow.resume()
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      await router.push('/').catch(() => {})
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      await router.push('/weight')
      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
    })
  })
})
