import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import EraseDataView from '../views/EraseDataView.vue'
import type { DataExportService } from '../service/data-export.service'
import type { DeviceEraseService, DeviceEraseSituation } from '../service/device-erase.service'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { memoryStorage } from '@/features/purchase/__tests__/billing-fixture'
import { showToast } from '@/shared/utils/toast'

const exportData = vi.hoisted(() => vi.fn<DataExportService['exportData']>())
const situation = vi.hoisted(() => vi.fn<DeviceEraseService['situation']>())
const erase = vi.hoisted(() => vi.fn<DeviceEraseService['erase']>())

vi.mock('../service/data-export.service', () => ({ dataExportService: { exportData } }))
vi.mock('../service/device-erase.service', () => ({
  deviceEraseService: { situation, erase },
}))
vi.mock('@/core/app-lifecycle/app-resume', () => ({ useAppResume: () => {} }))
vi.mock('@/shared/utils/toast', () => ({ showToast: vi.fn<typeof showToast>() }))

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
}

const FREE: DeviceEraseSituation = { signedIn: false, hasUnsyncedChanges: false }
const SUBSCRIBER: DeviceEraseSituation = { signedIn: true, hasUnsyncedChanges: false }

let replace: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  exportData.mockReset()
  situation.mockReset().mockResolvedValue(FREE)
  erase.mockReset().mockResolvedValue()
  vi.mocked(showToast).mockClear()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 411,
    height: 815,
    offsetTop: 0,
  })
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  vi.spyOn(animals, 'load').mockImplementation(async () => {
    animals.animals = [MILO]
    animals.hasLoaded = true
    return true
  })
  await router.push({ name: 'settings-erase' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  i18n.global.locale.value = 'fr'
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(EraseDataView, {
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function texte(wrapper: VueWrapper): string {
  return wrapper.text().replace(/\s+/g, ' ')
}

/** Les textes français séparent la ponctuation double par une insécable. */
function lisible(text: string | null | undefined): string {
  return (text ?? '').replace(/ /g, ' ')
}

function dialogue(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.v-overlay--active .confirm-dialog__panel')
}

function boutonsDuDialogue(): string[] {
  return [...(dialogue()?.querySelectorAll('.v-btn') ?? [])].map((b) => b.textContent!.trim())
}

async function toucher(selector: string): Promise<void> {
  document.body.querySelector<HTMLElement>(`.v-overlay--active ${selector}`)!.click()
  await flushPromises()
}

async function continuer(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.erase-data__continue').trigger('click')
  await flushPromises()
}

describe('EraseDataView, écran d’avant', () => {
  it('dit ce qui est retiré, propose une copie, et ce qui reste', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Effacer les données')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('de ce téléphone')
    expect(wrapper.get('.erase-data__title').text()).toBe('Effacer les données de ce téléphone')
    expect(texte(wrapper)).toContain(
      'Tout le carnet est retiré de ce téléphone : animaux, traitements, vaccins, poids et photos.',
    )
    expect(texte(wrapper)).toContain('Avant d’effacer, exporte une copie de ton carnet.')
    expect(wrapper.get('.erase-data__export').text()).toBe('Exporter une copie')
    expect(wrapper.findAll('.erase-data__fact').map((fact) => fact.text())).toEqual([
      'Plus aucun rappel ne sonnera sur ce téléphone.',
      'Les exports enregistrés dans Documents › MémoPatte restent sur le téléphone.',
      'Après l’effacement, MémoPatte redémarre comme au premier lancement.',
    ])
    expect(wrapper.get('.erase-data__continue').text()).toBe('Continuer')
    expect(wrapper.find('.erase-data__account').exists()).toBe(false)
  })

  it('ouvre directement le partage d’Android avec l’export JSON', async () => {
    exportData.mockResolvedValue('shared')
    const wrapper = await monter()

    await wrapper.get('.erase-data__export').trigger('click')
    await flushPromises()

    expect(exportData).toHaveBeenCalledExactlyOnceWith('json', 'share')
    expect(showToast).toHaveBeenCalledWith('Données exportées')
  })

  it('revient à Sauvegarde', async () => {
    const wrapper = await monter()

    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings-backup' })
  })

  it('n’accorde rien au féminin ni au masculin', async () => {
    situation.mockResolvedValue({ signedIn: true, hasUnsyncedChanges: true })
    const wrapper = await monter()

    expect(wrapper.text()).not.toMatch(/abonnée?\b|seule?\b|prête?\b/i)
  })
})

describe('EraseDataView, abonné', () => {
  it('rassure sur la sauvegarde cloud et annonce la déconnexion, sans jamais dire que rien ne sera récupérable', async () => {
    situation.mockResolvedValue(SUBSCRIBER)
    const wrapper = await monter()

    expect(texte(wrapper)).toContain('Le carnet est retiré de ce téléphone.')
    expect(wrapper.findAll('.erase-data__account').map((line) => lisible(line.text()))).toEqual([
      'Ta sauvegarde cloud n’est pas touchée : tu pourras la restaurer sur ce téléphone ou un autre.',
      'Cet appareil sera déconnecté de ton compte.',
    ])
    expect(wrapper.find('.erase-data__unsynced').exists()).toBe(false)
    expect(texte(wrapper)).not.toMatch(/Rien ne pourra être récupéré/)

    await continuer(wrapper)

    expect(lisible(dialogue()?.textContent)).toContain('Ta sauvegarde cloud n’est pas touchée')
    expect(lisible(dialogue()?.textContent)).not.toContain('Sans copie')
  })

  it('prévient des changements pas encore sauvegardés, sans bloquer', async () => {
    situation.mockResolvedValue({ signedIn: true, hasUnsyncedChanges: true })
    const wrapper = await monter()

    expect(wrapper.get('.erase-data__unsynced').text()).toBe(
      'Tes derniers changements ne sont pas encore dans ta sauvegarde cloud. Connecte-toi à Internet et attends la sauvegarde, ou exporte une copie.',
    )
    expect(wrapper.get('.erase-data__continue').attributes('disabled')).toBeUndefined()
  })
})

describe('EraseDataView, confirmations', () => {
  it('demande une première confirmation, « Annuler » avant « Effacer »', async () => {
    const wrapper = await monter()

    await continuer(wrapper)

    expect(lisible(dialogue()?.querySelector('.confirm-dialog__title')?.textContent)).toBe(
      'Effacer les données de ce téléphone ?',
    )
    expect(lisible(dialogue()?.textContent)).toContain(
      'Sans copie, ton carnet ne pourra pas être retrouvé.',
    )
    expect(boutonsDuDialogue()).toEqual(['Annuler', 'Effacer'])
    expect(erase).not.toHaveBeenCalled()
  })

  it('demande ensuite d’effacer définitivement, le bouton au-dessus de « Annuler »', async () => {
    const wrapper = await monter()
    await continuer(wrapper)

    await toucher('.confirm-dialog__confirm')

    expect(lisible(dialogue()?.querySelector('.confirm-dialog__title')?.textContent)).toBe(
      'Effacer définitivement ?',
    )
    expect(lisible(dialogue()?.textContent)).toContain(
      'Toutes les données de MémoPatte seront effacées de ce téléphone.',
    )
    expect(boutonsDuDialogue()).toEqual(['Effacer définitivement', 'Annuler'])
    expect(erase).not.toHaveBeenCalled()
  })

  it('n’efface qu’après la seconde confirmation', async () => {
    const wrapper = await monter()
    await continuer(wrapper)
    await toucher('.confirm-dialog__confirm')

    await toucher('.confirm-dialog__confirm')

    expect(erase).toHaveBeenCalledOnce()
  })

  it('n’efface rien quand on annule le second palier', async () => {
    const wrapper = await monter()
    await continuer(wrapper)
    await toucher('.confirm-dialog__confirm')

    await toucher('.confirm-dialog__cancel')

    expect(erase).not.toHaveBeenCalled()
    expect(dialogue()).toBeNull()
  })

  it('le dit quand l’effacement échoue, et laisse réessayer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    erase.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()
    await continuer(wrapper)
    await toucher('.confirm-dialog__confirm')
    await toucher('.confirm-dialog__confirm')

    expect(showToast).toHaveBeenCalledWith('Les données n’ont pas pu être effacées. Réessaie.', {
      tone: 'error',
    })
    expect(wrapper.get('.erase-data__continue').attributes('disabled')).toBeUndefined()
  })
})

it('se lit en anglais', async () => {
  i18n.global.locale.value = 'en'
  situation.mockResolvedValue({ signedIn: true, hasUnsyncedChanges: true })
  const wrapper = await monter()

  expect(wrapper.get('.erase-data__title').text()).toBe('Erase this phone’s data')
  expect(texte(wrapper)).toContain('Your latest changes aren’t in your cloud backup yet.')
  expect(texte(wrapper)).toContain('This device will be signed out of your account.')
  expect(texte(wrapper)).toContain('Exports saved in Documents › MémoPatte stay on the phone.')
  expect(wrapper.get('.erase-data__continue').text()).toBe('Continue')
})
