import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { createRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { useOpenSheet } from '@/shared/composables/use-open-sheet'
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
const feuilles: VueWrapper[] = []

function feuille(open: Ref<boolean>): VueWrapper {
  const wrapper = mount(
    defineComponent(() => {
      useOpenSheet(open)
      return () => h('div')
    }),
  )
  feuilles.push(wrapper)
  return wrapper
}

afterEach(() => {
  uninstall()
  for (const wrapper of feuilles.splice(0)) wrapper.unmount()
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

  it('sauvegarde trouvée sur le Carnet, notification touchée ensuite : sa feuille passe avant l’écran', async () => {
    const router = routeur()
    const flow = parcours()
    await router.push('/animals')
    uninstall = installRestorePrompt(router, () => flow)
    flow.offer(SUMMARY)
    await flushPromises()

    await router.push({
      name: 'home',
      query: { reminder: 'treatment:vermifuge-milo', step: 'actions' },
    })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')

    await router.replace('/')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')

    await router.push('/weight')
    await router.push('/')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('account-restore')
  })

  it('sauvegarde trouvée pendant qu’une feuille est dans l’adresse de l’accueil : attend une arrivée', async () => {
    const router = routeur()
    const flow = parcours()
    await router.push({ name: 'home', query: { reminder: 'vaccination:rage-luna' } })
    uninstall = installRestorePrompt(router, () => flow)

    flow.offer(SUMMARY)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')

    await router.replace('/')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')

    await router.push('/weight')
    await router.push('/')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('account-restore')
  })

  describe('feuille ouverte sur l’accueil sans adresse', () => {
    it('sauvegarde trouvée pendant qu’une feuille ouverte d’un tap est affichée : rien ne s’ouvre', async () => {
      const router = routeur()
      const flow = parcours()
      await router.push('/')
      uninstall = installRestorePrompt(router, () => flow)
      const open = ref(true)
      feuille(open)

      flow.offer(SUMMARY)
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      open.value = false
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      await router.push('/weight')
      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
    })

    it('feuille venue d’une notification, adresse effacée par l’accueil : rien ne s’ouvre', async () => {
      const router = routeur()
      const flow = parcours()
      await router.push({
        name: 'home',
        query: { reminder: 'treatment:vermifuge-milo', step: 'actions' },
      })
      uninstall = installRestorePrompt(router, () => flow)
      const open = ref(false)
      feuille(open)
      await router.replace('/')
      open.value = true
      await flushPromises()

      flow.offer(SUMMARY)
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      open.value = false
      await router.push('/weight')
      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
    })

    it('attend que toutes les feuilles ouvertes soient fermées', async () => {
      const router = routeur()
      const flow = parcours()
      await router.push('/')
      uninstall = installRestorePrompt(router, () => flow)
      const rappel = ref(true)
      const choix = ref(true)
      feuille(rappel)
      feuille(choix)

      rappel.value = false
      await flushPromises()
      flow.offer(SUMMARY)
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      choix.value = false
      await router.push('/weight')
      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
    })

    it('une feuille démontée ouverte ne retient plus l’écran', async () => {
      const router = routeur()
      const flow = parcours()
      await router.push('/')
      uninstall = installRestorePrompt(router, () => flow)
      feuille(ref(true)).unmount()
      feuilles.length = 0

      flow.offer(SUMMARY)
      await flushPromises()

      expect(router.currentRoute.value.name).toBe('account-restore')
    })
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

  describe('« Plus tard » vaut pour la journée, jour local', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    async function proposéPuisQuitté(router: Router, flow: RestoreFlow, at: Date): Promise<void> {
      vi.useFakeTimers({ toFake: ['Date'], now: at })
      await router.push('/')
      uninstall = installRestorePrompt(router, () => flow)
      flow.offer(SUMMARY)
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
      await router.replace('/')
      await router.push('/weight')
    }

    it('ne revient pas le même jour, même tard le soir', async () => {
      const router = routeur()
      const flow = parcours()
      await proposéPuisQuitté(router, flow, new Date(2026, 9, 25, 0, 30))

      vi.setSystemTime(new Date(2026, 9, 25, 23, 59))
      await router.push('/')
      await flushPromises()

      expect(router.currentRoute.value.name).toBe('home')
    })

    it('revient à la première arrivée sur l’accueil après minuit', async () => {
      const router = routeur()
      const flow = parcours()
      await proposéPuisQuitté(router, flow, new Date(2026, 9, 25, 23, 58))

      vi.setSystemTime(new Date(2026, 9, 26, 0, 1))
      await router.push('/')
      await flushPromises()

      expect(router.currentRoute.value.name).toBe('account-restore')
      expect(router.currentRoute.value.query).toEqual({ from: 'home' })
    })

    it('ne revient qu’une fois dans la nouvelle journée', async () => {
      const router = routeur()
      const flow = parcours()
      await proposéPuisQuitté(router, flow, new Date(2026, 9, 25, 9, 0))
      vi.setSystemTime(new Date(2026, 9, 26, 9, 0))
      await router.push('/')
      await flushPromises()
      await router.replace('/')
      await router.push('/weight')

      vi.setSystemTime(new Date(2026, 9, 26, 22, 0))
      await router.push('/')
      await flushPromises()

      expect(router.currentRoute.value.name).toBe('home')
    })

    it('le jour suivant, ne s’ouvre jamais sans une vraie arrivée sur l’accueil', async () => {
      const router = routeur()
      const flow = parcours()
      await proposéPuisQuitté(router, flow, new Date(2026, 9, 25, 9, 0))
      await router.push('/')
      await flushPromises()

      vi.setSystemTime(new Date(2026, 9, 26, 9, 0))
      flow.retryCheck()
      await flushPromises()
      flow.offer(SUMMARY)
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      await router.push('/weight')
      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
    })

    it('le lendemain, une notification touchée sur l’accueil ouvre sa feuille, pas l’écran', async () => {
      const router = routeur()
      const flow = parcours()
      await proposéPuisQuitté(router, flow, new Date(2026, 9, 25, 20, 0))
      await router.push('/')
      await flushPromises()

      vi.setSystemTime(new Date(2026, 9, 26, 8, 0))
      await router.replace({
        name: 'home',
        query: { reminder: 'treatment:vermifuge-milo', step: 'actions' },
      })
      await flushPromises()

      expect(router.currentRoute.value.name).toBe('home')
      expect(router.currentRoute.value.query).toEqual({
        reminder: 'treatment:vermifuge-milo',
        step: 'actions',
      })
    })

    it('le lendemain, un retour sur l’accueil qui rouvre une feuille passe avant l’écran', async () => {
      const router = routeur()
      const flow = parcours()
      await proposéPuisQuitté(router, flow, new Date(2026, 9, 25, 20, 0))
      await router.push('/animals')

      vi.setSystemTime(new Date(2026, 9, 26, 8, 0))
      await router.push({ name: 'home', query: { reminder: 'vaccination:rage-luna' } })
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      await router.push({ name: 'home', query: { step: 'given-when' } })
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')
    })

    it('le lendemain, un passage de l’accueil à l’accueil n’est pas une arrivée', async () => {
      const router = routeur()
      const flow = parcours()
      await proposéPuisQuitté(router, flow, new Date(2026, 9, 25, 20, 0))
      await router.push({ name: 'home', query: { reminder: 'treatment:vermifuge-milo' } })
      await flushPromises()

      vi.setSystemTime(new Date(2026, 9, 26, 8, 0))
      await router.replace('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('home')

      await router.push('/weight')
      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('account-restore')
    })

    it('compte le jour où l’écran est quitté, pas celui où il s’est ouvert', async () => {
      const router = routeur()
      const flow = parcours()
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 25, 23, 50) })
      await router.push('/')
      uninstall = installRestorePrompt(router, () => flow)
      flow.offer(SUMMARY)
      await flushPromises()

      vi.setSystemTime(new Date(2026, 9, 26, 0, 10))
      await router.replace('/')
      await router.push('/weight')
      await router.push('/')
      await flushPromises()

      expect(router.currentRoute.value.name).toBe('home')
    })
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
