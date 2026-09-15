import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import ExportSheet from '../ExportSheet.vue'
import SettingsView from '../SettingsView.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import type { Animal } from '@/features/animals/animal.schema'
import { useAnimalsStore } from '@/features/animals/animals.store'

vi.mock('../data-export.service', () => ({
  dataExportService: { exportData: vi.fn<() => Promise<'shared'>>() },
}))

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  initialWeightKg: null,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

let animalsStore: ReturnType<typeof useAnimalsStore>
let animals: Animal[]
let loadAnimals: MockInstance
let push: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  setActivePinia(createPinia())
  animalsStore = useAnimalsStore()
  animals = [MILO]
  loadAnimals = vi.spyOn(animalsStore, 'load').mockImplementation(async () => {
    animalsStore.animals = animals
    animalsStore.hasLoaded = true
    return true
  })
  await router.push({ name: 'settings' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(SettingsView, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function ligneExport(wrapper: VueWrapper) {
  return wrapper.get('.settings-row--export')
}

describe('SettingsView', () => {
  it('s’intitule « Paramètres » et revient à l’accueil', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Paramètres')
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'home' })
  })

  it('ne livre que les sections dont la destination existe : Mes données et À propos', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.section-card__title').map((title) => title.text())).toEqual([
      'Mes données',
      'À propos',
    ])
    expect(wrapper.text()).not.toMatch(/Plus|Compte|Importer|PDF|Confidentialité/)
  })

  it('charge les animaux s’ils ne le sont pas encore', async () => {
    await monter()
    expect(loadAnimals).toHaveBeenCalledOnce()

    wrapper!.unmount()
    wrapper = null
    await monter()
    expect(loadAnimals).toHaveBeenCalledOnce()
  })

  it('ouvre la feuille d’export depuis la ligne « Exporter mes données »', async () => {
    const wrapper = await monter()
    const ligne = ligneExport(wrapper)

    expect(ligne.text()).toBe('Exporter mes données')
    expect(ligne.attributes('disabled')).toBeUndefined()
    expect(wrapper.getComponent(ExportSheet).props('modelValue')).toBe(false)

    await ligne.trigger('click')

    expect(wrapper.getComponent(ExportSheet).props('modelValue')).toBe(true)
  })

  it('désactive l’export sans animal, avec « Rien à exporter pour l’instant »', async () => {
    animals = []
    const wrapper = await monter()
    const ligne = ligneExport(wrapper)

    expect(ligne.attributes('disabled')).toBeDefined()
    expect(ligne.classes()).toContain('settings-row--disabled')
    expect(ligne.text()).toContain('Rien à exporter pour l’instant')

    await ligne.trigger('click')
    expect(wrapper.getComponent(ExportSheet).props('modelValue')).toBe(false)
  })

  it('désactive l’export tant que les animaux ne sont pas chargés, sans sous-texte', async () => {
    loadAnimals.mockImplementation(() => new Promise(() => {}))
    const wrapper = await monter()
    const ligne = ligneExport(wrapper)

    expect(ligne.attributes('disabled')).toBeDefined()
    expect(ligne.text()).toBe('Exporter mes données')
  })

  it('signale un échec de lecture des animaux et relance le chargement au tap', async () => {
    loadAnimals.mockImplementation(async () => {
      animalsStore.error = new Error('base indisponible')
      return false
    })
    const wrapper = await monter()
    const ligne = ligneExport(wrapper)

    expect(ligne.attributes('disabled')).toBeUndefined()
    expect(ligne.text()).toContain('La base locale n’a pas répondu. Touche pour réessayer.')

    loadAnimals.mockImplementation(async () => {
      animalsStore.animals = animals
      animalsStore.hasLoaded = true
      animalsStore.error = null
      return true
    })
    await ligne.trigger('click')
    await flushPromises()

    expect(loadAnimals).toHaveBeenCalledTimes(2)
    expect(wrapper.getComponent(ExportSheet).props('modelValue')).toBe(false)
    expect(ligneExport(wrapper).text()).toBe('Exporter mes données')
  })

  it('affiche la version de l’app lue dans package.json', async () => {
    const wrapper = await monter()
    const version = wrapper.get('.settings-row--version')

    expect(import.meta.env.VITE_APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(version.text()).toBe(`Version${import.meta.env.VITE_APP_VERSION}`)
  })
})
