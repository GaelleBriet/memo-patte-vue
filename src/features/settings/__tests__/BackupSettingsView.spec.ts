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
import { readUsageSignals } from '@/core/usage/usage-signals'
import { showToast } from '@/shared/utils/toast'
import { provideBackupFacts, type BackupFacts } from '@/core/sync/service/backup-facts'
import {
  createRestoreFlow,
  provideRestoreFlow,
  type RestoreFlow,
} from '@/core/sync/service/restore-flow'
import type { RestoreProgress, RestoreRunResult } from '@/core/sync/service/account-restore'

const exportData = vi.hoisted(() => vi.fn<DataExportService['exportData']>())

vi.mock('../service/data-export.service', () => ({ dataExportService: { exportData } }))
vi.mock('@/core/app-lifecycle/app-resume', () => ({
  useAppResume: () => {},
  onAppResume: () => () => {},
}))
vi.mock('@/core/sync/service/network-status', () => ({ onNetworkOnline: () => () => {} }))
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
  departureReason: null,
  departureDate: null,
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
  provideBackupFacts(null)
  provideRestoreFlow(null)
  vi.useRealTimers()
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

  it('annonce Plus au présent, en anglais aussi', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monter()

    expect(wrapper.text()).toContain(
      'MémoPatte Plus adds a guaranteed cloud backup, photos included, and restores it on a new phone.',
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

  it('finit par « Effacer les données de ce téléphone », qui ouvre l’écran d’avant l’effacement', async () => {
    const wrapper = await monter()
    const ligne = wrapper.get('.backup-settings__content > :last-child')

    expect(ligne.classes()).toContain('backup-settings__erase')
    expect(ligne.text()).toBe('Effacer les données de ce téléphone')
    await ligne.trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'settings-erase' })
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

  describe('abonné Plus', () => {
    const NOW = new Date(2026, 9, 23, 8, 30)
    const SAVED: BackupFacts = {
      eligible: true,
      signInNeeded: false,
      online: true,
      syncEnabled: true,
      lastSyncedAt: new Date(2026, 9, 23, 8, 25).toISOString(),
      remaining: 0,
      carnetSize: 348,
      refused: 0,
      refusedPhotos: 0,
    }

    async function monterAbonné(facts: BackupFacts) {
      vi.useFakeTimers({ toFake: ['Date'], now: NOW })
      provideBackupFacts(async () => facts)
      const wrapper = await monter()
      await vi.waitFor(() => expect(wrapper.find('.backup-settings__status').exists()).toBe(true))
      return wrapper
    }

    function carteÉtat(wrapper: VueWrapper) {
      return wrapper
        .get('.backup-settings__status')
        .findAll('.settings-row__label, .settings-row__hint')
        .map((line) => line.text().replace(/\s+/g, ' '))
        .join(' ')
    }

    function libellésDesLignes(wrapper: VueWrapper) {
      return wrapper
        .findAll('.backup-settings__card .settings-row__label')
        .map((label) => label.text().replace(/\s+/g, ' '))
    }

    it('dernière sauvegarde il y a 5 min : photos sauvegardées, copie, effacer sans toucher au cloud', async () => {
      const wrapper = await monterAbonné(SAVED)
      const texte = wrapper.text().replace(/\s+/g, ' ')

      expect(carteÉtat(wrapper)).toBe(
        'Dernière sauvegarde : il y a 5 min Sauvegarde et restauration garanties.',
      )
      expect(libellésDesLignes(wrapper)).toEqual([
        'Dernière sauvegarde : il y a 5 min',
        'Photos sauvegardées',
        'Exporter une copie',
        'Effacer les données de ce téléphone',
      ])
      expect(wrapper.get('.backup-settings__photos').text()).toContain('Oui')
      expect(ligneCopie(wrapper).text()).toContain('Vers Google Drive, un e-mail ou un ordinateur')
      expect(wrapper.get('.backup-settings__erase').text()).toContain(
        'Ta sauvegarde cloud n’est pas touchée',
      )
      expect(texte).not.toContain('Sauvegarde d’Android')
      expect(texte).not.toContain('Ton carnet est sur ce téléphone')
      expect(texte).not.toContain('Découvrir MémoPatte Plus')
    })

    it('première sauvegarde en cours, 120 éléments sur 348, puis l’état normal', async () => {
      let facts: BackupFacts = { ...SAVED, lastSyncedAt: null, remaining: 228 }
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NOW })
      provideBackupFacts(async () => facts)
      const wrapper = await monter()
      await vi.advanceTimersByTimeAsync(0)

      expect(carteÉtat(wrapper)).toBe('Première sauvegarde en cours 120 éléments sur 348')
      expect(wrapper.find('.backup-settings__photos').exists()).toBe(false)

      facts = { ...SAVED, lastSyncedAt: NOW.toISOString() }
      await vi.advanceTimersByTimeAsync(2_000)

      expect(carteÉtat(wrapper)).toBe(
        'Dernière sauvegarde : il y a 1 min Sauvegarde et restauration garanties.',
      )
    })

    it('en attente de réseau, sans action demandée', async () => {
      const wrapper = await monterAbonné({ ...SAVED, online: false })

      expect(carteÉtat(wrapper)).toBe(
        'En attente de réseau La sauvegarde reprend dès que ce téléphone est connecté à Internet.',
      )
      expect(wrapper.find('.backup-settings__status--neutral').exists()).toBe(true)
      expect(wrapper.find('.backup-settings__photos').exists()).toBe(true)
      expect(wrapper.find('.backup-settings__sign-in').exists()).toBe(false)
    })

    it('reconnecte-toi : interrompue depuis hier à 18 h 20, « Se reconnecter » ouvre la connexion', async () => {
      const wrapper = await monterAbonné({
        ...SAVED,
        signInNeeded: true,
        lastSyncedAt: new Date(2026, 9, 22, 18, 20).toISOString(),
      })

      expect(carteÉtat(wrapper)).toBe(
        'Reconnecte-toi pour reprendre la sauvegarde Interrompue depuis hier à 18 h 20. Rien n’est perdu.',
      )
      expect(wrapper.find('.backup-settings__status--warning').exists()).toBe(true)
      expect(wrapper.find('.backup-settings__photos').exists()).toBe(false)
      expect(ligneCopie(wrapper).text()).toContain(
        'Conseillé tant que la sauvegarde est interrompue',
      )
      await wrapper.get('.backup-settings__sign-in').trigger('click')

      expect(push).toHaveBeenCalledWith({ name: 'sign-in', query: { from: 'settings-backup' } })
    })

    it('hors ligne pendant la première sauvegarde : pas encore « Photos sauvegardées »', async () => {
      const wrapper = await monterAbonné({ ...SAVED, online: false, lastSyncedAt: null })

      expect(carteÉtat(wrapper)).toContain('En attente de réseau')
      expect(wrapper.find('.backup-settings__photos').exists()).toBe(false)
    })

    it('état illisible : seulement la copie et l’effacement', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      provideBackupFacts(async () => Promise.reject(new Error('base fermée')))
      const wrapper = await monter()
      await vi.waitFor(() => expect(wrapper.find('.backup-settings__export').exists()).toBe(true))

      expect(libellésDesLignes(wrapper)).toEqual([
        'Exporter une copie',
        'Effacer les données de ce téléphone',
      ])
      expect(wrapper.text()).not.toContain('Ton carnet est sur ce téléphone')
      expect(wrapper.text()).not.toContain('Ta sauvegarde cloud n’est pas touchée')
    })

    it('reste l’écran d’un gratuit tant que la synchro du compte n’est pas activée', async () => {
      provideBackupFacts(async () => ({ ...SAVED, syncEnabled: false }))
      const wrapper = await monter()
      await vi.waitFor(() => expect(wrapper.text()).toContain('Ton carnet est sur ce téléphone'))

      expect(wrapper.find('.backup-settings__status').exists()).toBe(false)
    })

    describe('éléments refusés par le serveur', () => {
      it('s’ajoutent sous « Dernière sauvegarde », et « Contacter l’aide » ouvre Aide et contact', async () => {
        const wrapper = await monterAbonné({ ...SAVED, refused: 2 })

        expect(libellésDesLignes(wrapper)).toEqual([
          'Dernière sauvegarde : il y a 5 min',
          '2 éléments n’ont pas pu être sauvegardés · Contacter l’aide',
          'Photos sauvegardées',
          'Exporter une copie',
          'Effacer les données de ce téléphone',
        ])
        await wrapper.get('.backup-settings__refused').trigger('click')

        expect(push).toHaveBeenCalledWith({
          name: 'settings-help',
          query: { from: 'settings-backup' },
        })
      })

      it('s’ajoutent sous « Première sauvegarde », au singulier', async () => {
        const wrapper = await monterAbonné({
          ...SAVED,
          lastSyncedAt: null,
          remaining: 227,
          refused: 1,
        })

        expect(carteÉtat(wrapper)).toBe('Première sauvegarde en cours 120 éléments sur 347')
        expect(wrapper.get('.backup-settings__refused').text().replace(/\s+/g, ' ')).toBe(
          'Un élément n’a pas pu être sauvegardé · Contacter l’aide',
        )
      })

      it('s’ajoutent aussi sous « En attente de réseau », juste sous l’état', async () => {
        const wrapper = await monterAbonné({ ...SAVED, online: false, refused: 2 })

        expect(libellésDesLignes(wrapper).slice(0, 2)).toEqual([
          'En attente de réseau',
          '2 éléments n’ont pas pu être sauvegardés · Contacter l’aide',
        ])
      })

      it('s’ajoutent aussi sous « Reconnecte-toi », avant « Se reconnecter »', async () => {
        const wrapper = await monterAbonné({ ...SAVED, signInNeeded: true, refused: 2 })
        const état = wrapper.get('.backup-settings__status').element

        expect(état.nextElementSibling?.classList.contains('backup-settings__refused')).toBe(true)
        expect(wrapper.find('.backup-settings__sign-in').exists()).toBe(true)
      })

      it('une photo refusée cache « Photos sauvegardées · Oui »', async () => {
        const wrapper = await monterAbonné({ ...SAVED, refused: 1, refusedPhotos: 1 })

        expect(wrapper.find('.backup-settings__refused').exists()).toBe(true)
        expect(wrapper.find('.backup-settings__photos').exists()).toBe(false)
      })

      it('rien quand aucun élément n’est refusé', async () => {
        const wrapper = await monterAbonné(SAVED)

        expect(wrapper.find('.backup-settings__refused').exists()).toBe(false)
      })

      it('se lisent en anglais', async () => {
        i18n.global.locale.value = 'en'
        const wrapper = await monterAbonné({ ...SAVED, refused: 1 })

        expect(wrapper.get('.backup-settings__refused').text().replace(/\s+/g, ' ')).toBe(
          'One item couldn’t be backed up · Contact support',
        )
      })
    })

    it('se lit en anglais', async () => {
      i18n.global.locale.value = 'en'
      const wrapper = await monterAbonné({
        ...SAVED,
        signInNeeded: true,
        lastSyncedAt: new Date(2026, 9, 22, 18, 20).toISOString(),
      })

      expect(carteÉtat(wrapper)).toBe(
        'Sign back in to resume backup Interrupted since yesterday at 6:20 pm. Nothing is lost.',
      )
      expect(wrapper.get('.backup-settings__sign-in').text()).toBe('Sign in again')
      expect(ligneCopie(wrapper).text()).toContain('Recommended while backup is interrupted')
      expect(wrapper.get('.backup-settings__erase').text()).toContain(
        'Your cloud backup is not affected',
      )
    })
  })

  describe('« Restauration en attente »', () => {
    const SUMMARY = { animalCount: 2, lastBackupAt: '2026-10-20T19:04:00.000Z' }

    function parcours(): RestoreFlow {
      const flow = createRestoreFlow({
        pendingMode: async () => null,
        start: async () => {},
        run: () => new Promise(() => {}),
        progress: { done: 0, total: 0 },
        onProgress: () => () => {},
      })
      provideRestoreFlow(flow)
      return flow
    }

    function bloc(wrapper: VueWrapper) {
      return wrapper.find('.backup-settings__restore-pending')
    }

    function texteDuBloc(wrapper: VueWrapper) {
      return bloc(wrapper)
        .findAll('.settings-row__label, .settings-row__hint')
        .map((line) => line.text().replace(/\s+/g, ' '))
        .join(' ')
    }

    it('s’affiche quand la sauvegarde cloud attend « Fusionner » ou « Remplacer »', async () => {
      parcours().offer(SUMMARY)
      const wrapper = await monter()

      expect(texteDuBloc(wrapper)).toBe(
        'Restauration en attente Ta sauvegarde cloud attend ton choix : fusionner avec le carnet de ce téléphone, ou le remplacer.',
      )
      expect(bloc(wrapper).classes()).toContain('backup-settings__status--warning')
      expect(wrapper.get('.backup-settings__restore-choose').text()).toBe('Choisir')
      expect(wrapper.find('.backup-settings__restore-choose .v-btn__prepend').exists()).toBe(true)
    })

    it('« Choisir » ouvre « Restaurer mon carnet », qui ramène à la Sauvegarde', async () => {
      parcours().offer(SUMMARY)
      const wrapper = await monter()

      await wrapper.get('.backup-settings__restore-choose').trigger('click')

      expect(push).toHaveBeenCalledWith({
        name: 'account-restore',
        query: { from: 'settings-backup' },
      })
    })

    it('disparaît dès que le choix est fait', async () => {
      const flow = parcours()
      flow.offer(SUMMARY)
      const wrapper = await monter()

      void flow.choose('merge')
      await flushPromises()

      expect(flow.state.value.step).toBe('restoring')
      expect(bloc(wrapper).exists()).toBe(false)
      expect(wrapper.find('.backup-settings__restore-choose').exists()).toBe(false)
    })

    it('ne s’affiche jamais sans choix en attente', async () => {
      const flow = parcours()
      const wrapper = await monter()
      expect(bloc(wrapper).exists()).toBe(false)

      flow.checking()
      await flushPromises()
      expect(bloc(wrapper).exists()).toBe(false)

      flow.unreachable()
      await flushPromises()
      expect(bloc(wrapper).exists()).toBe(false)

      flow.noAnswer()
      await flushPromises()
      expect(bloc(wrapper).exists()).toBe(false)
    })

    it('ne s’affiche pas hors compte, sans restauration branchée', async () => {
      const wrapper = await monter()

      expect(bloc(wrapper).exists()).toBe(false)
    })

    describe('compte Plus dont la restauration attend un choix', () => {
      const PLUS_EN_ATTENTE: BackupFacts = {
        eligible: true,
        signInNeeded: false,
        online: true,
        syncEnabled: false,
        lastSyncedAt: null,
        remaining: 0,
        carnetSize: 0,
        refused: 0,
        refusedPhotos: 0,
      }

      async function monterPlus() {
        provideBackupFacts(async () => PLUS_EN_ATTENTE)
        const wrapper = await monter()
        await flushPromises()
        return wrapper
      }

      it('ne garde que le bloc, « Exporter une copie » et « Effacer les données »', async () => {
        parcours().offer(SUMMARY)
        const wrapper = await monterPlus()
        const texte = wrapper.text()

        expect(bloc(wrapper).exists()).toBe(true)
        expect(texte).not.toContain('Ton carnet est sur ce téléphone')
        expect(texte).not.toContain('Si ce téléphone est perdu')
        expect(texte).not.toContain('Sauvegarde d’Android')
        expect(wrapper.find('.backup-settings__discover').exists()).toBe(false)
        expect(
          wrapper.findAll('.backup-settings__content > *').map((element) => element.classes()),
        ).toEqual([
          expect.arrayContaining(['backup-settings__restore-pending']),
          expect.arrayContaining(['backup-settings__restore-choose']),
          expect.arrayContaining(['backup-settings__export']),
          expect.arrayContaining(['backup-settings__erase']),
        ])
      })

      it('sans choix en attente, garde l’écran sans sauvegarde cloud', async () => {
        parcours()
        const wrapper = await monterPlus()
        const texte = wrapper.text()

        expect(bloc(wrapper).exists()).toBe(false)
        expect(texte).toContain('Ton carnet est sur ce téléphone')
        expect(texte).toContain('Si ce téléphone est perdu')
        expect(texte).toContain('Sauvegarde d’Android')
        expect(wrapper.find('.backup-settings__discover').exists()).toBe(true)
      })
    })

    it('se lit en anglais', async () => {
      i18n.global.locale.value = 'en'
      parcours().offer(SUMMARY)
      const wrapper = await monter()

      expect(texteDuBloc(wrapper)).toBe(
        'Restore pending Your cloud backup is waiting for your choice: merge with the health record on this phone, or replace it.',
      )
      expect(wrapper.get('.backup-settings__restore-choose').text()).toBe('Choose')
    })
  })

  describe('restauration choisie qui attend le réseau', () => {
    const SUMMARY = { animalCount: 2, lastBackupAt: '2026-10-20T19:04:00.000Z' }
    const PLUS_SANS_SAUVEGARDE: BackupFacts = {
      eligible: true,
      signInNeeded: false,
      online: false,
      syncEnabled: false,
      lastSyncedAt: null,
      remaining: 0,
      carnetSize: 0,
      refused: 0,
      refusedPhotos: 0,
    }

    async function choixCoupéParLeRéseau(): Promise<RestoreFlow> {
      const flow = createRestoreFlow({
        pendingMode: async () => 'merge',
        start: async () => {},
        run: async () => {
          throw new Error('réseau coupé')
        },
        progress: { done: 0, total: 0 },
        onProgress: () => () => {},
      })
      provideRestoreFlow(flow)
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      flow.offer(SUMMARY)
      await flow.choose('merge')
      expect(flow.state.value.step).toBe('waiting-network')
      return flow
    }

    async function monterPlus(facts: BackupFacts = PLUS_SANS_SAUVEGARDE) {
      provideBackupFacts(async () => facts)
      const wrapper = await monter()
      await flushPromises()
      return wrapper
    }

    function bloc(wrapper: VueWrapper) {
      return wrapper.find('.backup-settings__restore-waiting')
    }

    function texteDuBloc(wrapper: VueWrapper) {
      return bloc(wrapper)
        .findAll('.settings-row__label, .settings-row__hint')
        .map((line) => line.text().replace(/\s+/g, ' '))
        .join(' ')
    }

    it('remplace l’écran sans sauvegarde cloud par « En attente de réseau », en gris', async () => {
      await choixCoupéParLeRéseau()
      const wrapper = await monterPlus()
      const texte = wrapper.text()

      expect(texteDuBloc(wrapper)).toBe(
        'En attente de réseau La restauration reprendra dès le retour du réseau. Rien n’est perdu.',
      )
      expect(bloc(wrapper).classes()).toContain('backup-settings__status--neutral')
      expect(texte).not.toContain('Ton carnet est sur ce téléphone')
      expect(texte).not.toContain('Si ce téléphone est perdu')
      expect(texte).not.toContain('Sauvegarde d’Android')
      expect(wrapper.find('.backup-settings__discover').exists()).toBe(false)
      expect(wrapper.find('.backup-settings__restore-pending').exists()).toBe(false)
      expect(
        wrapper.findAll('.backup-settings__content > *').map((element) => element.classes()),
      ).toEqual([
        expect.arrayContaining(['backup-settings__restore-waiting']),
        expect.arrayContaining(['backup-settings__export']),
        expect.arrayContaining(['backup-settings__erase']),
      ])
    })

    it('se lit en anglais', async () => {
      i18n.global.locale.value = 'en'
      await choixCoupéParLeRéseau()
      const wrapper = await monterPlus()

      expect(texteDuBloc(wrapper)).toBe(
        'Waiting for network Restoring will resume when you’re back online. Nothing is lost.',
      )
    })

    it('contrôle de la sauvegarde injoignable, sans restauration choisie : écran gratuit complet', async () => {
      const flow = createRestoreFlow({
        pendingMode: async () => null,
        start: async () => {},
        run: () => new Promise(() => {}),
        progress: { done: 0, total: 0 },
        onProgress: () => () => {},
      })
      provideRestoreFlow(flow)
      flow.checking()
      flow.unreachable()
      const wrapper = await monterPlus({ ...PLUS_SANS_SAUVEGARDE, eligible: false })
      const texte = wrapper.text()

      expect(bloc(wrapper).exists()).toBe(false)
      expect(texte).not.toContain('La restauration reprendra')
      expect(texte).toContain('Ton carnet est sur ce téléphone')
      expect(texte).toContain('Sauvegarde d’Android')
      expect(wrapper.find('.backup-settings__discover').exists()).toBe(true)
    })

    it('ne double pas l’état d’une sauvegarde cloud déjà active', async () => {
      await choixCoupéParLeRéseau()
      const wrapper = await monterPlus({ ...PLUS_SANS_SAUVEGARDE, syncEnabled: true })

      expect(bloc(wrapper).exists()).toBe(false)
      expect(wrapper.find('.backup-settings__status').text()).toContain('En attente de réseau')
    })
  })

  describe('restauration choisie en cours', () => {
    const SUMMARY = { animalCount: 2, lastBackupAt: '2026-10-20T19:04:00.000Z' }
    const PLUS_SANS_SAUVEGARDE: BackupFacts = {
      eligible: true,
      signInNeeded: false,
      online: true,
      syncEnabled: false,
      lastSyncedAt: null,
      remaining: 0,
      carnetSize: 0,
      refused: 0,
      refusedPhotos: 0,
    }

    let finishRun: (result: RestoreRunResult) => void
    let failRun: (cause: Error) => void

    function parcours(progress: RestoreProgress = { done: 0, total: 0 }): RestoreFlow {
      const flow = createRestoreFlow({
        pendingMode: async () => 'replace',
        start: async () => {},
        run: () =>
          new Promise<RestoreRunResult>((resolve, reject) => {
            finishRun = resolve
            failRun = reject
          }),
        progress,
        onProgress: () => () => {},
      })
      provideRestoreFlow(flow)
      return flow
    }

    async function monterPlus() {
      provideBackupFacts(async () => PLUS_SANS_SAUVEGARDE)
      const wrapper = await monter()
      await flushPromises()
      return wrapper
    }

    function enfants(wrapper: VueWrapper) {
      return wrapper.findAll('.backup-settings__content > *').map((element) => element.classes())
    }

    function écranGratuitAbsent(wrapper: VueWrapper) {
      const texte = wrapper.text()
      expect(texte).not.toContain('Ton carnet est sur ce téléphone')
      expect(texte).not.toContain('Sauvegarde d’Android')
      expect(wrapper.find('.backup-settings__discover').exists()).toBe(false)
    }

    it('montre la progression de « Restaurer mon carnet » à la place de l’écran gratuit', async () => {
      const flow = parcours({ done: 120, total: 348 })
      flow.offer(SUMMARY)
      void flow.choose('replace')
      const wrapper = await monterPlus()

      expect(flow.state.value.step).toBe('restoring')
      expect(
        wrapper
          .get('.backup-settings__restore-progress')
          .findAll('.settings-row__label, .settings-row__hint')
          .map((line) => line.text())
          .join(' '),
      ).toBe('Restauration de ton carnet 120 éléments sur 348')
      écranGratuitAbsent(wrapper)
      expect(enfants(wrapper)).toEqual([
        expect.arrayContaining(['backup-settings__restore-progress']),
        expect.arrayContaining(['backup-settings__export']),
        expect.arrayContaining(['backup-settings__erase']),
      ])
    })

    it('réseau revenu pendant l’attente : la progression remplace « En attente de réseau »', async () => {
      const flow = parcours()
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      flow.offer(SUMMARY)
      void flow.choose('replace')
      await flushPromises()
      failRun(new Error('réseau coupé'))
      await flushPromises()
      const wrapper = await monterPlus()
      expect(wrapper.find('.backup-settings__restore-waiting').exists()).toBe(true)

      void flow.resume()
      await flushPromises()

      expect(flow.state.value.step).toBe('restoring')
      expect(wrapper.find('.backup-settings__restore-waiting').exists()).toBe(false)
      expect(wrapper.get('.backup-settings__restore-progress').text()).toBe(
        'Restauration de ton carnet',
      )
      écranGratuitAbsent(wrapper)
    })

    it('carnet changé depuis « Remplacer » : le nouveau contrôle ne réaffiche pas l’écran gratuit', async () => {
      const flow = parcours()
      flow.offer(SUMMARY)
      void flow.choose('replace')
      const wrapper = await monterPlus()

      finishRun('carnet-changed')
      await flushPromises()

      expect(flow.state.value).toEqual({ step: 'checking', chosen: true })
      écranGratuitAbsent(wrapper)
      expect(enfants(wrapper)).toEqual([
        expect.arrayContaining(['backup-settings__export']),
        expect.arrayContaining(['backup-settings__erase']),
      ])

      flow.offer(SUMMARY)
      await flushPromises()
      expect(wrapper.find('.backup-settings__restore-pending').exists()).toBe(true)
      écranGratuitAbsent(wrapper)
    })

    it('restauration terminée : l’état de la sauvegarde active, sans repasser par l’écran gratuit', async () => {
      const flow = parcours()
      let answer: (facts: BackupFacts) => void = () => {}
      const read = vi.fn<() => Promise<BackupFacts>>(async () => PLUS_SANS_SAUVEGARDE)
      provideBackupFacts(read)
      flow.offer(SUMMARY)
      void flow.choose('merge')
      const wrapper = await monter()
      await flushPromises()
      expect(wrapper.find('.backup-settings__restore-progress').exists()).toBe(true)

      read.mockImplementationOnce(
        () =>
          new Promise<BackupFacts>((resolve) => {
            answer = resolve
          }),
      )
      finishRun('restored')
      await flushPromises()

      expect(flow.state.value.step).toBe('done')
      écranGratuitAbsent(wrapper)
      expect(enfants(wrapper)).toEqual([
        expect.arrayContaining(['backup-settings__export']),
        expect.arrayContaining(['backup-settings__erase']),
      ])

      answer({
        ...PLUS_SANS_SAUVEGARDE,
        syncEnabled: true,
        lastSyncedAt: new Date(Date.now() - 60_000).toISOString(),
      })
      await flushPromises()

      écranGratuitAbsent(wrapper)
      expect(wrapper.get('.backup-settings__status').text()).toContain('Dernière sauvegarde')
    })

    it('compte sans choix, pendant le premier contrôle : écran gratuit complet', async () => {
      const flow = parcours()
      flow.checking()
      const wrapper = await monterPlus()
      const texte = wrapper.text()

      expect(flow.state.value).toEqual({ step: 'checking', chosen: false })
      expect(wrapper.find('.backup-settings__restore-progress').exists()).toBe(false)
      expect(texte).toContain('Ton carnet est sur ce téléphone')
      expect(texte).toContain('Si ce téléphone est perdu')
      expect(texte).toContain('Sauvegarde d’Android')
      expect(wrapper.find('.backup-settings__discover').exists()).toBe(true)
    })

    it('se lit en anglais', async () => {
      i18n.global.locale.value = 'en'
      const flow = parcours()
      flow.offer(SUMMARY)
      void flow.choose('merge')
      const wrapper = await monterPlus()

      expect(wrapper.get('.backup-settings__restore-progress').text()).toBe(
        'Restoring your health record',
      )
    })

    it('ne double pas l’état d’une sauvegarde cloud déjà active', async () => {
      const flow = parcours()
      flow.offer(SUMMARY)
      void flow.choose('merge')
      provideBackupFacts(async () => ({ ...PLUS_SANS_SAUVEGARDE, syncEnabled: true }))
      const wrapper = await monter()
      await flushPromises()

      expect(wrapper.find('.backup-settings__restore-progress').exists()).toBe(false)
      expect(wrapper.find('.backup-settings__status').exists()).toBe(true)
    })
  })
})
