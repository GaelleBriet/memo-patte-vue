import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import NotificationPrimingView from '../NotificationPrimingView.vue'
import { dismissToast, toastMessage } from '../toast'
import { onBackButton } from '@/core/app-lifecycle/back-button'
import i18n from '@/core/i18n'
import { postponePriming, requestAfterPriming } from '@/core/notifications/permission'
import vuetify from '@/core/theme/vuetify'

vi.mock('@/core/notifications/permission', () => ({
  requestAfterPriming: vi.fn<() => Promise<boolean>>(),
  postponePriming: vi.fn<() => void>(),
}))

vi.mock('@/core/app-lifecycle/back-button', () => ({
  onBackButton: vi.fn<(handler: () => void) => () => void>(() => () => {}),
}))

const request = vi.mocked(requestAfterPriming)
const postpone = vi.mocked(postponePriming)
const backButton = vi.mocked(onBackButton)

const Vide = { render: () => null }
let routeur: Router
let replace: MockInstance

beforeEach(async () => {
  routeur = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/animals', name: 'animals', component: Vide }],
  })
  await routeur.push('/animals')
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
  request.mockResolvedValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
  dismissToast()
})

function monter(props: { animalName?: string; kind?: 'vaccination' | 'treatment' } = {}) {
  return mount(NotificationPrimingView, {
    props: { animalName: 'Milo', kind: 'vaccination', ...props },
    global: { plugins: [vuetify, i18n, routeur] },
  })
}

describe('NotificationPrimingView — contenu', () => {
  it('reprend les textes de la maquette', () => {
    const wrapper = monter()

    expect(wrapper.get('h1').text()).toBe('Ne rate plus aucun rappel')
    expect(wrapper.text()).toContain(
      'Active les notifications pour être prévenu à temps des vaccins et traitements de tes animaux.',
    )
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      'On te prévient avant le rappel de vaccin de Milo',
      'Ça marche même hors ligne',
      'Seulement pour les rappels que tu enregistres',
    ])
    expect(wrapper.get('.notification-priming__enable').text()).toBe('Activer les rappels')
    expect(wrapper.get('.notification-priming__later').text()).toBe('Plus tard')
  })

  it('parle du traitement quand il suit un formulaire de traitement', () => {
    const wrapper = monter({ animalName: 'Luna', kind: 'treatment' })

    expect(wrapper.findAll('li')[0]!.text()).toBe(
      'On te prévient avant le rappel de traitement de Luna',
    )
  })

  it('retire la puce personnalisée quand le prénom de l’animal est inconnu', () => {
    const wrapper = monter({ animalName: '' })

    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      'Ça marche même hors ligne',
      'Seulement pour les rappels que tu enregistres',
    ])
  })

  it('ne demande rien au système à l’affichage', () => {
    monter()

    expect(request).not.toHaveBeenCalled()
    expect(postpone).not.toHaveBeenCalled()
  })
})

describe('NotificationPrimingView — réponses', () => {
  it('« Activer les rappels » accordé : retour au Carnet avec le toast « Rappels activés »', async () => {
    const wrapper = monter()

    await wrapper.get('.notification-priming__enable').trigger('click')
    await flushPromises()

    expect(request).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
    expect(toastMessage.value).toBe('Rappels activés')
  })

  it('« Activer les rappels » refusé : retour au Carnet sans toast', async () => {
    request.mockResolvedValue(false)
    const wrapper = monter()

    await wrapper.get('.notification-priming__enable').trigger('click')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
    expect(toastMessage.value).toBeNull()
  })

  it('ignore un second tap pendant la demande système', async () => {
    let answer!: (granted: boolean) => void
    request.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const wrapper = monter()

    await wrapper.get('.notification-priming__enable').trigger('click')
    await wrapper.get('.notification-priming__enable').trigger('click')
    answer(true)
    await flushPromises()

    expect(request).toHaveBeenCalledOnce()
  })

  it('« Plus tard » : retour au Carnet sans demande système', async () => {
    const wrapper = monter()

    await wrapper.get('.notification-priming__later').trigger('click')
    await flushPromises()

    expect(postpone).toHaveBeenCalledOnce()
    expect(request).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('le retour Android vaut « Plus tard »', async () => {
    monter()
    const handler = backButton.mock.calls[0]![0]

    handler()
    await flushPromises()

    expect(postpone).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('rend le bouton retour Android en quittant l’écran', () => {
    const release = vi.fn<() => void>()
    backButton.mockReturnValueOnce(release)
    const wrapper = monter()

    wrapper.unmount()

    expect(release).toHaveBeenCalledOnce()
  })
})
