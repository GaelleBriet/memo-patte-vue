import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import ExportSheet from '../views/ExportSheet.vue'
import type * as DataImport from '../service/data-import.service'
import PdfExportSheet from '../views/PdfExportSheet.vue'
import MyDataSettingsView from '../views/MyDataSettingsView.vue'
import { importFixtureJson } from './import-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { memoryStorage } from '@/features/purchase/__tests__/billing-fixture'
import {
  applyWeightUnit,
  currentWeightUnit,
  WEIGHT_UNIT_STORAGE_KEY,
} from '@/shared/domain/weight-unit-preference'

vi.mock('../service/data-export.service', () => ({
  dataExportService: { exportData: vi.fn<() => Promise<'shared'>>() },
}))

const hasLocalData = vi.hoisted(() => vi.fn<() => Promise<boolean>>())
const importData = vi.hoisted(() => vi.fn<() => Promise<void>>())
const promptNotificationsIfReminders = vi.hoisted(() =>
  vi.fn<(router: unknown, from: string) => Promise<boolean>>(async () => false),
)

type DataImportModule = typeof DataImport

vi.mock('../service/data-import.service', async (importOriginal) => ({
  ...(await importOriginal<DataImportModule>()),
  dataImportService: { hasLocalData, importData },
}))

vi.mock('@/app/reminders-priming', () => ({ promptNotificationsIfReminders }))

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  birthDateApproximate: false,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
  unfollowedOn: null,
  departureReason: null,
  departureDate: null,
}

let animalsStore: ReturnType<typeof useAnimalsStore>
let animals: Animal[]
let loadAnimals: MockInstance
let push: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-15T10:00:00Z') })
  hasLocalData.mockReset()
  importData.mockReset()
  promptNotificationsIfReminders.mockClear()
  setActivePinia(createPinia())
  animalsStore = useAnimalsStore()
  animals = [MILO]
  loadAnimals = vi.spyOn(animalsStore, 'load').mockImplementation(async () => {
    animalsStore.animals = animals
    animalsStore.hasLoaded = true
    return true
  })
  await router.push({ name: 'settings-data' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
})

afterEach(() => {
  vi.useRealTimers()
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  applyWeightUnit('kg')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(MyDataSettingsView, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

async function importer(wrapper: VueWrapper) {
  const input = wrapper.get<HTMLInputElement>('input[type="file"]').element
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File([importFixtureJson()], 'export.json', { type: 'application/json' })],
  })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}

function ligneExport(wrapper: VueWrapper) {
  return wrapper.get('.settings-row--export')
}

function lignePdf(wrapper: VueWrapper) {
  return wrapper.get('.settings-row--export-pdf')
}

describe('MyDataSettingsView', () => {
  it('s’intitule « Mes données » et revient à la liste des Paramètres', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Mes données')
    const replace = vi.spyOn(router, 'replace').mockResolvedValue()
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('range l’unité, puis « Exporter » et « Importer » (V23)', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.settings-section-title').map((titre) => titre.text())).toEqual([
      'Exporter',
      'Importer',
    ])
    expect(
      wrapper.findAll('.settings-row').map((row) => row.find('.settings-row__label').text()),
    ).toEqual([
      'Unité de poids',
      'Exporter mes données',
      'Exporter en PDF',
      'Importer un export MémoPatte',
    ])
    expect(wrapper.text()).not.toContain('Change seulement')
  })

  describe('Unité de poids (U1)', () => {
    function unites(wrapper: VueWrapper) {
      return wrapper.findAll('.settings-row--weight-unit .form-segmented button')
    }

    it('ouvre « Mes données » sur l’unité de poids, en choix exclusif nommé', async () => {
      const wrapper = await monter()
      const ligne = wrapper.get('.settings-row--weight-unit')
      const groupe = ligne.get('.form-segmented')

      expect(wrapper.find('.settings-row').classes()).toContain('settings-row--weight-unit')
      expect(ligne.get('.settings-row__label').text()).toBe('Unité de poids')
      expect(ligne.get('.settings-row__hint').text()).toBe('Pour afficher et saisir les pesées')
      expect(groupe.attributes('role')).toBe('radiogroup')
      expect(document.getElementById(groupe.attributes('aria-labelledby')!)?.textContent).toBe(
        'Unité de poids',
      )
      expect(unites(wrapper).map((bouton) => bouton.text())).toEqual(['kgkilogrammes', 'lblivres'])
      expect(unites(wrapper).map((bouton) => bouton.attributes('aria-label'))).toEqual([
        'Kilogrammes, kg',
        'Livres, lb',
      ])
      expect(unites(wrapper).map((bouton) => bouton.attributes('aria-checked'))).toEqual([
        'true',
        'false',
      ])
    })

    it('retient les livres sur l’appareil et les applique aussitôt', async () => {
      const wrapper = await monter()

      await unites(wrapper)[1]!.trigger('click')

      expect(currentWeightUnit()).toBe('lb')
      expect(localStorage.getItem(WEIGHT_UNIT_STORAGE_KEY)).toBe('lb')
      expect(unites(wrapper)[1]!.attributes('aria-checked')).toBe('true')
    })

    it('garde toujours une unité cochée', async () => {
      const wrapper = await monter()

      await unites(wrapper)[0]!.trigger('click')

      expect(currentWeightUnit()).toBe('kg')
      expect(unites(wrapper)[0]!.attributes('aria-checked')).toBe('true')
    })
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

    expect(ligne.get('.settings-row__label').text()).toBe('Exporter mes données')
    expect(ligne.get('.settings-row__hint').text()).toBe('JSON ou CSV')
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
    expect(ligne.text()).toBe('Exporter mes donnéesJSON ou CSV')
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
    expect(ligneExport(wrapper).text()).toBe('Exporter mes donnéesJSON ou CSV')
  })

  describe('Exporter en PDF (DO-4, gratuit)', () => {
    it('ouvre la feuille PDF sans compte ni Plus', async () => {
      const wrapper = await monter()
      const ligne = lignePdf(wrapper)

      expect(ligne.get('.settings-row__label').text()).toBe('Exporter en PDF')
      expect(ligne.get('.settings-row__hint').text()).toBe('Tous les animaux ou un seul')
      expect(ligne.find('.plus-badge').exists()).toBe(false)
      expect(ligne.find('.d-sr-only').exists()).toBe(false)
      expect(ligne.attributes('disabled')).toBeUndefined()
      expect(wrapper.findComponent(PdfExportSheet).exists()).toBe(false)

      await ligne.trigger('click')
      await flushPromises()

      expect(push).not.toHaveBeenCalled()
      expect(wrapper.getComponent(PdfExportSheet).props('modelValue')).toBe(true)
      expect(wrapper.getComponent(PdfExportSheet).props('animals')).toEqual([
        { id: MILO.id, name: 'Milo' },
      ])
    })

    it('donne à la feuille tous les animaux, dans l’ordre des chips', async () => {
      const luna: Animal = { ...MILO, id: '33333333-3333-4333-8333-333333333333', name: 'Luna' }
      animals = [luna, MILO]
      const wrapper = await monter()

      await lignePdf(wrapper).trigger('click')
      await flushPromises()

      expect(wrapper.getComponent(PdfExportSheet).props('animals')).toEqual([
        { id: luna.id, name: 'Luna' },
        { id: MILO.id, name: 'Milo' },
      ])
    })

    it('donne à part les animaux qu’on ne suit plus, exportables seuls', async () => {
      const luna: Animal = {
        ...MILO,
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Luna',
        unfollowedOn: '2026-09-10',
      }
      animals = [luna, MILO]
      const wrapper = await monter()

      await lignePdf(wrapper).trigger('click')
      await flushPromises()

      const sheet = wrapper.getComponent(PdfExportSheet)
      expect(sheet.props('animals')).toEqual([{ id: MILO.id, name: 'Milo' }])
      expect(sheet.props('unfollowedAnimals')).toEqual([{ id: luna.id, name: 'Luna' }])
    })

    it('désactive la ligne sans animal, avec « Rien à exporter pour l’instant »', async () => {
      animals = []
      const wrapper = await monter()
      const ligne = lignePdf(wrapper)

      expect(ligne.attributes('disabled')).toBeDefined()
      expect(ligne.text()).toContain('Rien à exporter pour l’instant')
    })

    it('signale un échec de lecture des animaux et relance le chargement au tap', async () => {
      loadAnimals.mockImplementation(async () => {
        animalsStore.error = new Error('base indisponible')
        return false
      })
      const wrapper = await monter()
      const ligne = lignePdf(wrapper)

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
      expect(wrapper.findComponent(PdfExportSheet).exists()).toBe(false)
    })
  })

  it.each([
    ['avec des animaux', [MILO]],
    ['sans animal', []],
  ])(
    'ouvre le sélecteur de fichier depuis « Importer un export MémoPatte », %s',
    async (_, liste) => {
      animals = liste
      const wrapper = await monter()
      const lignes = wrapper.findAll('.settings-row').map((row) => row.text())
      const ligne = wrapper.get('.settings-row--import')
      const click = vi
        .spyOn(wrapper.get('input[type="file"]').element as HTMLInputElement, 'click')
        .mockImplementation(() => undefined)

      expect(lignes.at(-1)).toBe('Importer un export MémoPatte')
      expect(ligne.attributes('disabled')).toBeUndefined()
      await ligne.trigger('click')

      expect(click).toHaveBeenCalledOnce()
    },
  )

  it('montre l’import en cours sur la ligne et bloque un second tap', async () => {
    animals = []
    hasLocalData.mockResolvedValue(false)
    let finish!: () => void
    importData.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    const wrapper = await monter()

    await importer(wrapper)

    const ligne = wrapper.get('.settings-row--import')
    expect(ligne.attributes('disabled')).toBeDefined()
    expect(ligne.text()).toContain('Import…')
    finish()
    await flushPromises()
    expect(wrapper.get('.settings-row--import').attributes('disabled')).toBeUndefined()
  })

  it('après un import réussi, recharge les animaux et propose l’explication des rappels', async () => {
    hasLocalData.mockResolvedValue(false)
    importData.mockResolvedValue()
    const wrapper = await monter()
    loadAnimals.mockClear()

    await importer(wrapper)

    expect(loadAnimals).toHaveBeenCalledOnce()
    expect(promptNotificationsIfReminders).toHaveBeenCalledWith(router, 'settings-data')
  })

  it('ne propose pas l’explication des rappels après un import raté', async () => {
    hasLocalData.mockResolvedValue(false)
    importData.mockRejectedValue(new Error('disque plein'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const wrapper = await monter()

    await importer(wrapper)

    expect(promptNotificationsIfReminders).not.toHaveBeenCalled()
  })
})
