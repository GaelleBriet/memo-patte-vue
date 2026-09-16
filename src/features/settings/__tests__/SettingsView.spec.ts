import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import ExportSheet from '../ExportSheet.vue'
import type * as DataImport from '../data-import.service'
import SettingsView from '../SettingsView.vue'
import { importFixtureJson } from './import-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import type { Animal } from '@/features/animals/animal.schema'
import { useAnimalsStore } from '@/features/animals/animals.store'
import { memoryStorage } from '@/features/purchase/__tests__/billing-fixture'
import { writeStoredPlusStatus } from '@/features/purchase/plus-status-storage'

vi.mock('../data-export.service', () => ({
  dataExportService: { exportData: vi.fn<() => Promise<'shared'>>() },
}))

const hasLocalData = vi.hoisted(() => vi.fn<() => Promise<boolean>>())
const importData = vi.hoisted(() => vi.fn<() => Promise<void>>())
const promptNotificationsIfReminders = vi.hoisted(() =>
  vi.fn<(router: unknown, from: string) => Promise<boolean>>(async () => false),
)

type DataImportModule = typeof DataImport

vi.mock('../data-import.service', async (importOriginal) => ({
  ...(await importOriginal<DataImportModule>()),
  dataImportService: { hasLocalData, importData },
}))

vi.mock('@/app/reminders-priming', () => ({ promptNotificationsIfReminders }))

const consent = vi.hoisted(() => ({ granted: false }))
const optIn = vi.hoisted(() => vi.fn<() => Promise<void>>())
const optOut = vi.hoisted(() => vi.fn<() => Promise<void>>())

vi.mock('@/core/analytics', () => ({
  hasConsent: () => consent.granted,
  optIn,
  optOut,
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
  hasLocalData.mockReset()
  importData.mockReset()
  promptNotificationsIfReminders.mockClear()
  consent.granted = false
  optIn.mockReset().mockImplementation(async () => void (consent.granted = true))
  optOut.mockReset().mockImplementation(async () => void (consent.granted = false))
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

describe('SettingsView', () => {
  it('s’intitule « Paramètres » et revient à l’accueil', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Paramètres')
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'home' })
  })

  it('ne livre que les sections dont la destination existe : Plus, Mes données, Confidentialité et À propos', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.section-card__title').map((title) => title.text())).toEqual([
      'MémoPatte Plus',
      'Mes données',
      'Confidentialité',
      'À propos',
    ])
    expect(wrapper.text()).not.toMatch(/déjà abonné|Compte|Export PDF|Politique/)
  })

  describe('MémoPatte Plus', () => {
    it('ouvre l’écran sur la découverte de Plus, avant les autres sections', async () => {
      const wrapper = await monter()

      expect(wrapper.get('.section-card__title').text()).toBe('MémoPatte Plus')
      expect(wrapper.get('.settings-row--plus-discover').text()).toContain(
        'Découvrir MémoPatte Plus',
      )
    })

    it('annonce le statut à qui est déjà dans Plus', async () => {
      writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })
      const wrapper = await monter()

      expect(wrapper.get('.settings-row--plus-status').text()).toContain('Plus à vie')
      expect(wrapper.find('.settings-row--plus-discover').exists()).toBe(false)
    })

    it('range « Gérer mon abonnement » dans MémoPatte Plus, et non dans Confidentialité', async () => {
      writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-09-14T10:00:00Z' })
      const wrapper = await monter()
      const carte = wrapper
        .get('.settings-row--manage-subscription')
        .element.closest('.section-card')

      expect(carte?.querySelector('.section-card__title')?.textContent).toBe('MémoPatte Plus')
    })
  })

  describe('Confidentialité', () => {
    function interrupteur(wrapper: VueWrapper) {
      return wrapper.get<HTMLInputElement>('.settings-row--analytics input[type="checkbox"]')
    }

    it('nomme l’interrupteur des statistiques par son libellé', async () => {
      const wrapper = await monter()
      const input = interrupteur(wrapper)

      expect(wrapper.get('.settings-row--analytics').text()).toContain(
        'Statistiques d’usage anonymes',
      )
      expect([...input.element.labels!].map((label) => label.textContent?.trim())).toContain(
        'Statistiques d’usage anonymes',
      )
    })

    it('annonce l’interrupteur comme un interrupteur aux lecteurs d’écran', async () => {
      const wrapper = await monter()

      expect(interrupteur(wrapper).attributes('role')).toBe('switch')
    })

    it('ne pose aucun voile sous le doigt pendant l’appui', async () => {
      const wrapper = await monter()
      const zone = wrapper.get('.settings-row--analytics .v-selection-control__input')

      await zone.trigger('mousedown')

      expect(zone.find('.v-ripple__container').exists()).toBe(false)
    })

    it.each([
      [false, 'désactivé'],
      [true, 'activé'],
    ])('reflète le consentement enregistré (%s → %s)', async (granted) => {
      consent.granted = granted
      const wrapper = await monter()

      expect(interrupteur(wrapper).element.checked).toBe(granted)
    })

    it('active les statistiques dès que l’interrupteur passe à oui', async () => {
      const wrapper = await monter()

      await interrupteur(wrapper).setValue(true)

      expect(optIn).toHaveBeenCalledOnce()
      expect(optOut).not.toHaveBeenCalled()
      expect(interrupteur(wrapper).element.checked).toBe(true)
    })

    it('bascule aussi d’un tap sur le libellé, toute la ligne servant de zone de tap', async () => {
      const wrapper = await monter()

      await wrapper.get('.settings-row--analytics .settings-row__label').trigger('click')

      expect(optIn).toHaveBeenCalledOnce()
      expect(interrupteur(wrapper).element.checked).toBe(true)
    })

    it('les coupe dès que l’interrupteur passe à non', async () => {
      consent.granted = true
      const wrapper = await monter()

      await interrupteur(wrapper).setValue(false)

      expect(optOut).toHaveBeenCalledOnce()
      expect(optIn).not.toHaveBeenCalled()
      expect(interrupteur(wrapper).element.checked).toBe(false)
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

      expect(lignes.indexOf('Importer un export MémoPatte')).toBe(
        lignes.findIndex((texte) => texte.startsWith('Exporter mes données')) + 1,
      )
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
    expect(promptNotificationsIfReminders).toHaveBeenCalledWith(router, 'settings')
  })

  it('ne propose pas l’explication des rappels après un import raté', async () => {
    hasLocalData.mockResolvedValue(false)
    importData.mockRejectedValue(new Error('disque plein'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const wrapper = await monter()

    await importer(wrapper)

    expect(promptNotificationsIfReminders).not.toHaveBeenCalled()
  })

  it('affiche la version de l’app lue dans package.json', async () => {
    const wrapper = await monter()
    const version = wrapper.get('.settings-row--version')

    expect(import.meta.env.VITE_APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(version.text()).toBe(`Version${import.meta.env.VITE_APP_VERSION}`)
  })
})
