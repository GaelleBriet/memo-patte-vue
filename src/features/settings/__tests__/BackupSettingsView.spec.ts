import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import BackupSettingsView from '../views/BackupSettingsView.vue'
import type { DataExportService } from '../service/data-export.service'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { memoryStorage } from '@/features/purchase/__tests__/billing-fixture'
import { readUsageSignals } from '@/shared/utils/usage-signals'
import { showToast } from '@/shared/utils/toast'

const exportData = vi.hoisted(() => vi.fn<DataExportService['exportData']>())

vi.mock('../service/data-export.service', () => ({ dataExportService: { exportData } }))
vi.mock('@/core/app-lifecycle/app-resume', () => ({ useAppResume: () => {} }))
vi.mock('@/shared/utils/toast', () => ({ showToast: vi.fn<typeof showToast>() }))

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

let animalsStore: ReturnType<typeof useAnimalsStore>
let animals: Animal[]
let loadAnimals: MockInstance
let push: MockInstance
let replace: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  exportData.mockReset()
  vi.mocked(showToast).mockClear()
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  animalsStore = useAnimalsStore()
  animals = [MILO]
  loadAnimals = vi.spyOn(animalsStore, 'load').mockImplementation(async () => {
    animalsStore.animals = animals
    animalsStore.hasLoaded = true
    return true
  })
  await router.push({ name: 'settings-backup' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
})

afterEach(async () => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  i18n.global.locale.value = 'fr'
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(BackupSettingsView, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function ligneCopie(wrapper: VueWrapper) {
  return wrapper.get('.backup-settings__export')
}

describe('BackupSettingsView', () => {
  it('s’intitule « Sauvegarde » et revient aux Paramètres', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Sauvegarde')
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('dit ce qui reste sur ce téléphone, ce qu’Android peut garder et ce que Plus garantit', async () => {
    const wrapper = await monter()
    const texte = wrapper.text().replace(/\s+/g, ' ')

    expect(texte).toContain('Ton carnet est sur ce téléphone')
    expect(texte).toContain(
      'Il ne quitte ce téléphone que si tu l’exportes, ou par la sauvegarde d’Android.',
    )
    expect(texte).toContain(
      'Si ce téléphone est perdu, ton carnet peut l’être aussi. Une copie ou Plus l’évite.',
    )
    expect(wrapper.findAll('.backup-settings__section').map((section) => section.text())).toEqual([
      'Sauvegarde d’Android',
      'Copie de ton carnet',
    ])
    expect(texte).toContain(
      'Si la sauvegarde de ton téléphone est active, Android peut garder une copie de ton carnet. Sans les photos ni tes réglages, et sans garantie : ne compte pas dessus pour tout retrouver.',
    )
    expect(texte).toContain(
      'MémoPatte Plus ajoute une sauvegarde cloud garantie, photos comprises, et la restaure sur un nouveau téléphone.',
    )
  })

  it('ne parle jamais de sauvegarde « en ligne » et n’accorde rien au féminin ni au masculin', async () => {
    const wrapper = await monter()

    expect(wrapper.text()).not.toMatch(/en ligne|abonnée?\b|seule?\b/i)
  })

  it('ouvre MémoPatte Plus depuis « Découvrir MémoPatte Plus »', async () => {
    const wrapper = await monter()
    const lien = wrapper.get('.backup-settings__discover')

    expect(lien.text()).toBe('Découvrir MémoPatte Plus')
    await lien.trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'plus' })
  })

  describe('« Exporter une copie »', () => {
    it('vise Google Drive, un e-mail ou un ordinateur', async () => {
      const wrapper = await monter()

      expect(ligneCopie(wrapper).get('.settings-row__label').text()).toBe('Exporter une copie')
      expect(ligneCopie(wrapper).get('.settings-row__hint').text()).toBe(
        'Vers Google Drive, un e-mail ou un ordinateur',
      )
    })

    it('ouvre directement le partage d’Android avec l’export JSON', async () => {
      exportData.mockResolvedValue('shared')
      const wrapper = await monter()

      await ligneCopie(wrapper).trigger('click')
      await flushPromises()

      expect(exportData).toHaveBeenCalledExactlyOnceWith('json', 'share')
      expect(showToast).toHaveBeenCalledWith('Données exportées')
    })

    it('compte le partage comme l’export JSON qui protège le carnet', async () => {
      exportData.mockResolvedValue('shared')
      const wrapper = await monter()

      await ligneCopie(wrapper).trigger('click')
      await flushPromises()

      expect(readUsageSignals().jsonShare.count).toBe(1)
    })

    it('ne compte pas un partage annulé, et n’affiche rien', async () => {
      exportData.mockResolvedValue('cancelled')
      const wrapper = await monter()

      await ligneCopie(wrapper).trigger('click')
      await flushPromises()

      expect(readUsageSignals().jsonShare.count).toBe(0)
      expect(showToast).not.toHaveBeenCalled()
    })

    it('le dit quand l’export échoue', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      exportData.mockRejectedValue(new Error('base fermée'))
      const wrapper = await monter()

      await ligneCopie(wrapper).trigger('click')
      await flushPromises()

      expect(showToast).toHaveBeenCalledWith('L’export n’a pas pu être préparé. Réessaie.', {
        tone: 'error',
      })
    })

    it('reste occupée pendant la préparation, sans relancer un second partage', async () => {
      let finir: (value: 'shared') => void = () => undefined
      exportData.mockReturnValue(new Promise((resolve) => (finir = resolve)))
      const wrapper = await monter()

      await ligneCopie(wrapper).trigger('click')

      expect(ligneCopie(wrapper).attributes('aria-busy')).toBe('true')
      expect(ligneCopie(wrapper).text()).toContain('Préparation…')
      await ligneCopie(wrapper).trigger('click')
      finir('shared')
      await flushPromises()

      expect(exportData).toHaveBeenCalledOnce()
      expect(ligneCopie(wrapper).attributes('aria-busy')).toBe('false')
    })

    it('est grisée tant que le carnet est vide, comme dans Mes données', async () => {
      animals = []
      const wrapper = await monter()

      expect(ligneCopie(wrapper).attributes('disabled')).toBeDefined()
      expect(ligneCopie(wrapper).text()).toContain('Rien à exporter pour l’instant')
    })

    it('relance la lecture du carnet quand la base n’a pas répondu', async () => {
      loadAnimals.mockImplementationOnce(async () => {
        animalsStore.error = new Error('base fermée')
        return false
      })
      const wrapper = await monter()

      expect(ligneCopie(wrapper).text()).toContain('La base locale n’a pas répondu.')
      await ligneCopie(wrapper).trigger('click')

      expect(loadAnimals).toHaveBeenCalledTimes(2)
      expect(exportData).not.toHaveBeenCalled()
    })
  })

  it('se lit en anglais', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monter()
    const texte = wrapper.text().replace(/\s+/g, ' ')

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Backup')
    expect(texte).toContain('Your health record is on this phone')
    expect(texte).toContain('If this phone is lost, your health record may be too.')
    expect(ligneCopie(wrapper).text()).toContain('Export a copy')
    expect(texte).toContain('To Google Drive, an email or a computer')
    expect(texte).toContain('Explore MémoPatte Plus')
    expect(texte).not.toMatch(/online/i)
  })
})
