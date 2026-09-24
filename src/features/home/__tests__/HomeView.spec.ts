import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest'

import AnimalPickerSheet from '../views/AnimalPickerSheet.vue'
import HomeView from '../views/HomeView.vue'
import type { HomeReminderSource, HomeRemindersService } from '../service/home-reminders.service'
import { provideHomeRemindersService, useHomeStore } from '../store/home.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import type { Animal } from '@/features/animals/schema/animal.schema'
import type * as DataImport from '@/features/settings/service/data-import.service'
import { importFixtureJson } from '@/features/settings/__tests__/import-fixture'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { useTreatmentsStore } from '@/features/treatments/store/treatments.store'
import TreatmentReminderSheet from '@/features/treatments/views/TreatmentReminderSheet.vue'
import { useVaccinationsStore } from '@/features/vaccinations/store/vaccinations.store'
import VaccinationReminderSheet from '@/features/vaccinations/views/VaccinationReminderSheet.vue'
import WeightSheet from '@/features/weight/views/WeightSheet.vue'
import AnimalChipSelector from '@/shared/components/AnimalChipSelector.vue'
import { forgetPhotoUrls } from '@/core/photos/use-photo-urls'
import {
  getNotificationPermissionStatus,
  openNotificationSettings,
  type NotificationPermissionStatus,
} from '@/core/notifications/permission'

vi.mock('@/core/photos/photo-storage', () => ({
  savePhoto: vi.fn<(base64: string) => Promise<string>>(),
  deletePhoto: vi.fn<(name: string) => Promise<void>>(),
  photoDisplayUrl: vi.fn<(name: string) => Promise<string>>(async (name) => `url:${name}`),
  photoExists: vi.fn<(name: string) => Promise<boolean>>(async () => true),
}))

vi.mock('@/core/notifications/permission', () => ({
  getNotificationPermissionStatus: vi.fn<() => Promise<NotificationPermissionStatus>>(
    async () => 'granted',
  ),
  openNotificationSettings: vi.fn<() => Promise<void>>(async () => {}),
}))

const hasLocalData = vi.hoisted(() => vi.fn<() => Promise<boolean>>(async () => false))
const importData = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => {}))
const promptNotificationsIfReminders = vi.hoisted(() =>
  vi.fn<(router: unknown, from: string) => Promise<boolean>>(async () => false),
)

vi.mock('@/features/settings/service/data-import.service', async (importOriginal) => ({
  ...(await importOriginal<typeof DataImport>()),
  dataImportService: { hasLocalData, importData },
}))

vi.mock('@/app/reminders-priming', () => ({ promptNotificationsIfReminders }))

const TODAY = new Date('2026-09-09T12:00:00')

function animal(id: string, name: string): Animal {
  return {
    id,
    name,
    species: 'dog',
    breed: null,
    birthDate: null,
    initialWeightKg: null,
    photoPath: null,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
  }
}

const MILO = animal('11111111-1111-4111-8111-111111111111', 'Milo')
const LUNA = animal('33333333-3333-4333-8333-333333333333', 'Luna')

function source(overrides: Partial<HomeReminderSource>): HomeReminderSource {
  return {
    kind: 'vaccination',
    id: crypto.randomUUID(),
    animalId: MILO.id,
    label: 'CHPPiL',
    dueDate: '2026-09-07',
    treatmentType: null,
    ...overrides,
  }
}

const CHPPIL_MILO_RETARD = source({ id: 'v1', label: 'CHPPiL', dueDate: '2026-09-07' })
const VERMIFUGE_LUNA_AUJOURDHUI = source({
  id: 't1',
  kind: 'treatment',
  animalId: LUNA.id,
  label: 'Milbemax',
  treatmentType: 'deworming',
  dueDate: '2026-09-09',
})
const ANTIPARASITAIRE_MILO_3J = source({
  id: 't2',
  kind: 'treatment',
  label: 'Bravecto',
  treatmentType: 'antiparasitic',
  dueDate: '2026-09-12',
})
const SANS_ECHEANCE = source({ id: 'v2', label: 'Leptospirose', dueDate: null })

let animalsStore: ReturnType<typeof useAnimalsStore>
let animals: Animal[]
let sources: HomeReminderSource[]
let listSources: Mock<HomeRemindersService['listSources']>
let loadAnimals: MockInstance
let push: MockInstance

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
  forgetPhotoUrls()
  setActivePinia(createPinia())
  animalsStore = useAnimalsStore()
  animals = [MILO, LUNA]
  sources = []
  loadAnimals = vi.spyOn(animalsStore, 'load').mockImplementation(async () => {
    animalsStore.animals = animals
    animalsStore.hasLoaded = true
    animalsStore.error = null
    return true
  })
  listSources = vi.fn<HomeRemindersService['listSources']>(async () => sources)
  provideHomeRemindersService(() => ({ listSources }))
  await router.push({ name: 'home' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

// Un accueil resté monté écouterait encore le retour au premier plan des tests suivants.
const mounted: ReturnType<typeof mount>[] = []

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  provideHomeRemindersService(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function monter() {
  const wrapper = mount(HomeView, { global: { plugins: [vuetify, i18n, router] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function rows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.reminder-row').map((row) => ({
    title: row.get('.reminder-row__title').text(),
    subtitle: row.get('.reminder-row__subtitle').text(),
    badge: row.get('.reminder-row__badge').text(),
    status: [...row.classes()].find((name) => name.startsWith('reminder-row--')) ?? null,
  }))
}

function upToDateLines(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('.home-up-to-date__text, .home-up-to-date__next')
    .map((line) => line.text())
}

describe('HomeView — chargement et erreur', () => {
  it('charge les animaux et les rappels au montage', async () => {
    await monter()

    expect(loadAnimals).toHaveBeenCalledOnce()
    expect(listSources).toHaveBeenCalledOnce()
  })

  it('affiche un indicateur sur fond neutre tant que rien n’est chargé, sans header pétrole', async () => {
    loadAnimals.mockImplementation(() => new Promise(() => {}))
    const wrapper = await monter()

    expect(wrapper.find('.home-loading').exists()).toBe(true)
    expect(wrapper.find('.home-header').exists()).toBe(false)
  })

  it('propose de réessayer quand la base ne répond pas, et relance les deux chargements', async () => {
    loadAnimals.mockImplementation(async () => {
      animalsStore.error = new Error('base indisponible')
      return false
    })
    const wrapper = await monter()

    expect(wrapper.find('.home-error').exists()).toBe(true)
    expect(wrapper.find('.home-header').exists()).toBe(false)
    expect(wrapper.find('.home-welcome').exists()).toBe(false)

    await wrapper.get('.home-error__retry').trigger('click')

    expect(loadAnimals).toHaveBeenCalledTimes(2)
    expect(listSources).toHaveBeenCalledTimes(2)
  })

  it('signale aussi un échec du chargement des rappels', async () => {
    listSources.mockRejectedValue(new Error('base indisponible'))
    const wrapper = await monter()

    expect(wrapper.find('.home-error').exists()).toBe(true)
    expect(useHomeStore().error?.message).toBe('base indisponible')
  })
})

describe('HomeView — A1 tous les animaux, avec rappels', () => {
  beforeEach(() => {
    sources = [
      ANTIPARASITAIRE_MILO_3J,
      VERMIFUGE_LUNA_AUJOURDHUI,
      CHPPIL_MILO_RETARD,
      SANS_ECHEANCE,
    ]
  })

  it('porte la marque dans le header, sans date ni salutation', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.home-header__title').text()).toBe('MémoPatte')
    expect(wrapper.get('.home-header__subtitle').text()).toBe('Ton foyer')
  })

  it('ouvre les Paramètres depuis l’icône du header', async () => {
    const wrapper = await monter()
    const settings = wrapper.get('.home-header .home-header__settings')

    expect(settings.attributes('aria-label')).toBe('Paramètres')
    await settings.trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('rend les chips en mode filtre, sans sélection', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.animal-chip').map((chip) => chip.text())).toEqual(['Milo', 'Luna'])
    expect(wrapper.getComponent(AnimalChipSelector).props('mode')).toBe('filter')
    expect(wrapper.getComponent(AnimalChipSelector).props('selectedId')).toBeNull()
  })

  it('passe la photo de chaque animal à sa chip, null sans photo', async () => {
    animals = [{ ...MILO, photoPath: 'milo.jpg' }, LUNA]

    const wrapper = await monter()

    expect(
      wrapper
        .getComponent(AnimalChipSelector)
        .props('animals')
        .map((chip) => chip.photoUrl),
    ).toEqual(['url:milo.jpg', null])
  })

  it('mène au formulaire de création en un tap sur la chip « + »', async () => {
    const wrapper = await monter()

    await wrapper.get('.animal-chip-selector__add').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-new' })
  })

  it('compte les rappels de tous les animaux et signale le retard', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.home-todo .section-card__title').text()).toBe('À faire')
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('3 rappels')
    expect(wrapper.get('.home-overdue-banner').text()).toBe('1 rappel en retard')
  })

  it('liste les rappels dans une seule carte, du plus urgent au moins urgent, titrés du produit, type et animal dessous', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.home-todo .section-card__card')).toHaveLength(1)
    expect(rows(wrapper)).toEqual([
      {
        title: 'CHPPiL',
        subtitle: 'Vaccin · Milo',
        badge: 'En retard · 2 j',
        status: 'reminder-row--overdue',
      },
      {
        title: 'Milbemax',
        subtitle: 'Vermifuge · Luna',
        badge: 'Aujourd’hui',
        status: 'reminder-row--today',
      },
      {
        title: 'Bravecto',
        subtitle: 'Antiparasitaire · Milo',
        badge: 'Dans 3 jours',
        status: 'reminder-row--later',
      },
    ])
  })

  it('affiche l’échéance avec le badge partagé, variante du statut et icône de la maquette', async () => {
    const wrapper = await monter()

    const badges = wrapper.findAll('.reminder-row .due-status-chip').map((badge) => ({
      variant: [...badge.classes()].find((name) => name.startsWith('due-status-chip--')),
      icon: badge.find('svg').exists(),
    }))
    expect(badges).toEqual([
      { variant: 'due-status-chip--overdue', icon: false },
      { variant: 'due-status-chip--today', icon: true },
      { variant: 'due-status-chip--later', icon: true },
    ])
  })

  it('n’affiche ni l’état « Tout est à jour » ni l’écran de bienvenue', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.home-up-to-date').exists()).toBe(false)
    expect(wrapper.find('.home-welcome').exists()).toBe(false)
  })

  it('écrit Demain pour une échéance au lendemain', async () => {
    sources = [source({ id: 'v3', label: 'Rage', dueDate: '2026-09-10' })]
    const wrapper = await monter()

    expect(rows(wrapper)[0]).toMatchObject({ badge: 'Demain', status: 'reminder-row--tomorrow' })
  })

  it('accorde le bandeau au pluriel', async () => {
    sources = [CHPPIL_MILO_RETARD, source({ id: 'v4', animalId: LUNA.id, dueDate: '2026-09-01' })]
    const wrapper = await monter()

    expect(wrapper.get('.home-overdue-banner').text()).toBe('2 rappels en retard')
  })
  it('arrive toujours sur la vue de tous les animaux, même si le Carnet en a sélectionné un', async () => {
    animalsStore.select(LUNA.id)
    const wrapper = await monter()

    expect(animalsStore.selectedAnimalId).toBeNull()
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('3 rappels')
    expect(rows(wrapper).map((row) => row.subtitle)).toEqual([
      'Vaccin · Milo',
      'Vermifuge · Luna',
      'Antiparasitaire · Milo',
    ])
  })

  it('affiche les nouvelles sources quand on remonte l’accueil', async () => {
    const premier = await monter()
    premier.unmount()
    sources = [
      ...sources,
      source({ id: 'v5', animalId: LUNA.id, label: 'Rage', dueDate: '2026-09-10' }),
    ]

    const wrapper = await monter()

    expect(listSources).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('4 rappels')
  })
})

describe('HomeView — retour au premier plan', () => {
  it('passe un rappel du jour en retard quand l’app revient le lendemain', async () => {
    sources = [VERMIFUGE_LUNA_AUJOURDHUI]
    const wrapper = await monter()
    expect(rows(wrapper)[0]).toMatchObject({ badge: 'Aujourd’hui' })

    vi.setSystemTime(new Date('2026-09-10T08:00:00'))
    simulateWebResume()
    await flushPromises()

    expect(rows(wrapper)[0]).toMatchObject({
      badge: 'En retard · 1 j',
      status: 'reminder-row--overdue',
    })
  })

  it('relit les animaux et les rappels sans réinitialiser le filtre', async () => {
    const wrapper = await monter()
    await wrapper.findAll('.animal-chip')[1]!.trigger('click')
    sources = [VERMIFUGE_LUNA_AUJOURDHUI]

    simulateWebResume()
    await flushPromises()

    expect(loadAnimals).toHaveBeenCalledTimes(2)
    expect(listSources).toHaveBeenCalledTimes(2)
    expect(animalsStore.selectedAnimalId).toBe(LUNA.id)
    expect(rows(wrapper)).toHaveLength(1)
  })
})

describe('HomeView — rappels désactivés', () => {
  const permissionStatus = vi.mocked(getNotificationPermissionStatus)

  afterEach(() => {
    permissionStatus.mockResolvedValue('granted')
  })

  it('n’affiche aucun bandeau quand les rappels sont actifs', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.home-reminders-off').exists()).toBe(false)
  })

  it.each<NotificationPermissionStatus>(['unasked', 'unavailable'])(
    'n’affiche aucun bandeau tant que l’état est « %s »',
    async (status) => {
      permissionStatus.mockResolvedValue(status)
      const wrapper = await monter()

      expect(wrapper.find('.home-reminders-off').exists()).toBe(false)
    },
  )

  it('affiche le bandeau au-dessus de « À faire » quand les rappels sont désactivés (R1)', async () => {
    permissionStatus.mockResolvedValue('disabled')
    sources = [ANTIPARASITAIRE_MILO_3J]
    const wrapper = await monter()

    const banner = wrapper.get('.home-reminders-off')
    expect(banner.text()).toContain('Les rappels sont désactivés')
    expect(banner.get('.home-reminders-off__link').text()).toBe('Activer dans les réglages')
    const todo = wrapper.get('.home-todo').element
    expect(banner.element.compareDocumentPosition(todo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('le garde au-dessus de la bannière de retard (R2)', async () => {
    permissionStatus.mockResolvedValue('disabled')
    sources = [CHPPIL_MILO_RETARD]
    const wrapper = await monter()

    const overdue = wrapper.get('.home-overdue-banner').element
    expect(wrapper.get('.home-reminders-off').element.compareDocumentPosition(overdue)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('ouvre les réglages de notifications de l’app', async () => {
    permissionStatus.mockResolvedValue('disabled')
    const wrapper = await monter()

    await wrapper.get('.home-reminders-off__link').trigger('click')

    expect(openNotificationSettings).toHaveBeenCalledOnce()
  })

  it('disparaît au retour des réglages quand la permission a été accordée', async () => {
    permissionStatus.mockResolvedValue('disabled')
    const wrapper = await monter()
    expect(wrapper.find('.home-reminders-off').exists()).toBe(true)

    permissionStatus.mockResolvedValue('granted')
    simulateWebResume()
    await flushPromises()

    expect(wrapper.find('.home-reminders-off').exists()).toBe(false)
  })
})

describe('HomeView — A2 animal sélectionné, avec rappels', () => {
  beforeEach(() => {
    sources = [ANTIPARASITAIRE_MILO_3J, VERMIFUGE_LUNA_AUJOURDHUI, CHPPIL_MILO_RETARD]
  })

  it('filtre les rappels au tap sur une chip et masque le nom de l’animal', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.animal-chip')[0]!.trigger('click')
    await flushPromises()

    expect(animalsStore.selectedAnimalId).toBe(MILO.id)
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Milo · 2 rappels')
    expect(rows(wrapper)).toEqual([
      {
        title: 'CHPPiL',
        subtitle: 'Vaccin',
        badge: 'En retard · 2 j',
        status: 'reminder-row--overdue',
      },
      {
        title: 'Bravecto',
        subtitle: 'Antiparasitaire',
        badge: 'Dans 3 jours',
        status: 'reminder-row--later',
      },
    ])
  })

  it('filtre sur Luna sans bandeau quand elle n’a pas de retard', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.animal-chip')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Luna · 1 rappel')
    expect(wrapper.find('.home-overdue-banner').exists()).toBe(false)
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('revient à tous les animaux au second tap sur la chip active', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.animal-chip')[0]!.trigger('click')
    await flushPromises()
    await wrapper.findAll('.animal-chip')[0]!.trigger('click')
    await flushPromises()

    expect(animalsStore.selectedAnimalId).toBeNull()
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('3 rappels')
  })
})

describe('HomeView — A3 animal sélectionné, aucun rappel', () => {
  beforeEach(() => {
    sources = [VERMIFUGE_LUNA_AUJOURDHUI]
  })

  async function monterSurMilo() {
    const wrapper = await monter()
    await wrapper.findAll('.animal-chip')[0]!.trigger('click')
    await flushPromises()
    return wrapper
  }

  it('n’écrit que le prénom en compteur et l’état « Tout est à jour » nominatif', async () => {
    const wrapper = await monterSurMilo()

    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Milo')
    expect(wrapper.find('.home-todo .section-card__card').exists()).toBe(false)
    expect(wrapper.find('.home-overdue-banner').exists()).toBe(false)
    expect(wrapper.get('.home-up-to-date__title').text()).toBe('Tout est à jour')
    expect(wrapper.get('.home-up-to-date__text').text()).toBe('Aucun rappel à venir pour Milo.')
  })

  it('ouvre le Carnet de l’animal sélectionné par le lien texte', async () => {
    const wrapper = await monterSurMilo()

    expect(wrapper.get('.home-up-to-date__add').text()).toBe('Ajouter un vaccin ou un traitement')
    await wrapper.get('.home-up-to-date__add').trigger('click')

    expect(animalsStore.selectedAnimalId).toBe(MILO.id)
    expect(push).toHaveBeenCalledWith({ name: 'animals' })
  })
})

describe('HomeView — A4 tous les animaux, aucun rappel', () => {
  it('liste les animaux dans le sous-texte, sans compteur', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.home-todo .section-card__counter').exists()).toBe(false)
    expect(wrapper.find('.home-todo .section-card__card').exists()).toBe(false)
    expect(wrapper.get('.home-up-to-date__text').text()).toBe(
      'Milo et Luna n’ont aucun rappel à venir.',
    )
  })

  it('ignore un vaccin sans échéance', async () => {
    sources = [SANS_ECHEANCE]
    const wrapper = await monter()

    expect(wrapper.find('.home-up-to-date').exists()).toBe(true)
  })

  it('ouvre le Carnet du premier animal par le lien texte', async () => {
    const wrapper = await monter()

    await wrapper.get('.home-up-to-date__add').trigger('click')

    expect(animalsStore.selectedAnimalId).toBe(MILO.id)
    expect(push).toHaveBeenCalledWith({ name: 'animals' })
  })
})

describe('HomeView — fenêtre de 30 jours, aujourd’hui compris', () => {
  const RETARD_ANCIEN = source({ id: 'v-ancien', label: 'Leishmaniose', dueDate: '2025-06-01' })
  const RAGE_LUNA_J29 = source({
    id: 'v-j29',
    animalId: LUNA.id,
    label: 'Rage',
    dueDate: '2026-10-08',
  })
  const TYPHUS_LUNA_J30 = source({
    id: 'v-j30',
    animalId: LUNA.id,
    label: 'Typhus',
    dueDate: '2026-10-09',
  })
  const CARRE_MILO_2027 = source({ id: 'v-2027', label: 'Carré', dueDate: '2027-08-26' })
  const VERMIFUGE_LUNA_NOVEMBRE = source({
    id: 't-nov',
    kind: 'treatment',
    animalId: LUNA.id,
    label: 'Milbemax',
    treatmentType: 'deworming',
    dueDate: '2026-11-08',
  })

  it('liste les retards, même anciens, et les échéances jusqu’à J+29', async () => {
    sources = [TYPHUS_LUNA_J30, RAGE_LUNA_J29, RETARD_ANCIEN, CARRE_MILO_2027]
    const wrapper = await monter()

    expect(rows(wrapper).map((row) => row.title)).toEqual(['Leishmaniose', 'Rage'])
    expect(rows(wrapper)[1]).toMatchObject({ badge: 'Dans 29 jours' })
  })

  it('compte dans l’en-tête et le bandeau ce qui est affiché', async () => {
    sources = [TYPHUS_LUNA_J30, RAGE_LUNA_J29, RETARD_ANCIEN, CARRE_MILO_2027]
    const wrapper = await monter()

    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('2 rappels')
    expect(wrapper.get('.home-overdue-banner').text()).toBe('1 rappel en retard')

    await wrapper.findAll('.animal-chip')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Luna · 1 rappel')
  })

  it('n’annonce pas de prochain rappel tant que la liste en montre', async () => {
    sources = [RAGE_LUNA_J29, CARRE_MILO_2027]
    const wrapper = await monter()

    expect(wrapper.find('.home-up-to-date__next').exists()).toBe(false)
  })

  it('annonce le prochain rappel de l’animal sélectionné, sans son prénom', async () => {
    sources = [CARRE_MILO_2027, VERMIFUGE_LUNA_NOVEMBRE]
    const wrapper = await monter()
    await wrapper.findAll('.animal-chip')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Milo')
    expect(wrapper.get('.home-up-to-date__title').text()).toBe('Tout est à jour')
    expect(upToDateLines(wrapper)).toEqual([
      'Prochain rappel\u00a0: Carré le 26\u00a0août\u00a02027',
    ])
  })

  it('annonce le prochain rappel sans prénom quand le foyer n’a qu’un animal', async () => {
    animals = [MILO]
    sources = [CARRE_MILO_2027]
    const wrapper = await monter()

    expect(upToDateLines(wrapper)).toEqual([
      'Prochain rappel\u00a0: Carré le 26\u00a0août\u00a02027',
    ])
  })

  it('nomme l’animal du prochain rappel dans la vue de tous les animaux', async () => {
    sources = [CARRE_MILO_2027, VERMIFUGE_LUNA_NOVEMBRE, TYPHUS_LUNA_J30]
    const wrapper = await monter()

    expect(wrapper.find('.home-todo .section-card__counter').exists()).toBe(false)
    expect(wrapper.find('.home-overdue-banner').exists()).toBe(false)
    expect(upToDateLines(wrapper)).toEqual([
      'Prochain rappel\u00a0: Typhus pour Luna le 9\u00a0oct.\u00a02026',
    ])
  })

  it('n’annonce rien quand aucun rappel n’existe', async () => {
    sources = [SANS_ECHEANCE]
    const wrapper = await monter()

    expect(upToDateLines(wrapper)).toEqual(['Milo et Luna n’ont aucun rappel à venir.'])
  })

  it('fait entrer une échéance à J+30 dans la liste quand l’app revient le lendemain', async () => {
    sources = [TYPHUS_LUNA_J30]
    const wrapper = await monter()
    expect(wrapper.find('.home-up-to-date__next').exists()).toBe(true)

    vi.setSystemTime(new Date('2026-09-10T08:00:00'))
    simulateWebResume()
    await flushPromises()

    expect(wrapper.find('.home-up-to-date__next').exists()).toBe(false)
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('1 rappel')
    expect(rows(wrapper)).toEqual([
      {
        title: 'Typhus',
        subtitle: 'Vaccin · Luna',
        badge: 'Dans 29 jours',
        status: 'reminder-row--later',
      },
    ])
  })
})

describe('HomeView — un seul animal', () => {
  beforeEach(() => {
    animals = [MILO]
  })

  function chipsPressees(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.animal-chip').map((chip) => chip.attributes('aria-pressed'))
  }

  it('s’ouvre sur sa chip sélectionnée, compteur et liste à son nom', async () => {
    sources = [ANTIPARASITAIRE_MILO_3J, CHPPIL_MILO_RETARD]
    const wrapper = await monter()

    expect(chipsPressees(wrapper)).toEqual(['true'])
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Milo · 2 rappels')
    expect(rows(wrapper).map((row) => row.subtitle)).toEqual(['Vaccin', 'Antiparasitaire'])
  })

  it('écrit « Tout est à jour » à son nom', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Milo')
    expect(wrapper.get('.home-up-to-date__text').text()).toBe('Aucun rappel à venir pour Milo.')
  })

  it('garde sa chip sélectionnée quand on la tape', async () => {
    sources = [CHPPIL_MILO_RETARD]
    const wrapper = await monter()
    expect(chipsPressees(wrapper)).toEqual(['true'])

    await wrapper.get('.animal-chip').trigger('click')
    await flushPromises()

    expect(chipsPressees(wrapper)).toEqual(['true'])
    expect(wrapper.get('.animal-chip').classes()).toContain('animal-chip--selected')
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Milo · 1 rappel')
  })

  it('revient sur « tous » à l’ouverture suivante quand un deuxième animal est arrivé', async () => {
    sources = [CHPPIL_MILO_RETARD, VERMIFUGE_LUNA_AUJOURDHUI]
    const premier = await monter()
    premier.unmount()
    animalsStore.select(MILO.id)
    animals = [MILO, LUNA]

    const wrapper = await monter()

    expect(chipsPressees(wrapper)).toEqual(['false', 'false'])
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('2 rappels')
  })

  it('sélectionne l’animal restant à l’ouverture suivante quand le foyer redescend à un', async () => {
    animals = [MILO, LUNA]
    sources = [CHPPIL_MILO_RETARD]
    const premier = await monter()
    await premier.findAll('.animal-chip')[1]!.trigger('click')
    premier.unmount()
    animals = [MILO]

    const wrapper = await monter()

    expect(chipsPressees(wrapper)).toEqual(['true'])
    expect(wrapper.get('.home-todo .section-card__counter').text()).toBe('Milo · 1 rappel')
  })
})

describe('HomeView — A5 premier lancement, aucun animal', () => {
  beforeEach(() => {
    animals = []
  })

  it('remplace tout l’écran par la bienvenue, sans header ni chips', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.home-header').exists()).toBe(false)
    expect(wrapper.findComponent(AnimalChipSelector).exists()).toBe(false)
    expect(wrapper.find('.home-todo').exists()).toBe(false)
    expect(wrapper.get('.home-welcome__illustration').attributes('src')).toContain(
      'brand-illustration',
    )
    expect(wrapper.get('.home-welcome__illustration').attributes('alt')).toBe('')
    expect(wrapper.get('.home-welcome__title').text()).toBe('Bienvenue sur MémoPatte')
    expect(wrapper.get('.home-welcome__text').text()).toBe(
      'Le carnet de santé de tes animaux, toujours à jour.',
    )
  })

  it('mène au formulaire de création', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.home-welcome__create').text()).toBe('Créer mon premier animal')
    await wrapper.get('.home-welcome__create').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-new' })
  })

  describe('import d’un export', () => {
    beforeEach(() => {
      hasLocalData.mockClear()
      importData.mockReset().mockResolvedValue()
      promptNotificationsIfReminders.mockClear()
      vi.stubGlobal('visualViewport', {
        addEventListener() {},
        removeEventListener() {},
        width: 412,
        height: 915,
        offsetTop: 0,
      })
    })

    async function monterAttache() {
      const wrapper = mount(HomeView, {
        global: { plugins: [vuetify, i18n, router] },
        attachTo: document.body,
      })
      mounted.push(wrapper)
      await flushPromises()
      return wrapper
    }

    async function choisirFichier(wrapper: ReturnType<typeof mount>, content: string) {
      const input = wrapper.get<HTMLInputElement>('input[type="file"]').element
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File([content], 'memopatte-export.json', { type: 'application/json' })],
      })
      input.dispatchEvent(new Event('change'))
      await flushPromises()
    }

    it('ouvre directement le sélecteur de documents depuis le lien sous le bouton', async () => {
      const wrapper = await monterAttache()
      const input = wrapper.get<HTMLInputElement>('input[type="file"]').element
      const click = vi.spyOn(input, 'click').mockImplementation(() => undefined)

      const lien = wrapper.get('.home-welcome__import')
      expect(lien.text()).toBe('Importer un export MémoPatte')
      expect(lien.element.tagName).toBe('BUTTON')
      expect(wrapper.get('.home-welcome__create').element.nextElementSibling === lien.element).toBe(
        true,
      )
      await lien.trigger('click')

      expect(click).toHaveBeenCalledOnce()
      expect(push).not.toHaveBeenCalled()
    })

    it('affiche le carnet importé puis propose l’explication des rappels depuis l’accueil', async () => {
      const wrapper = await monterAttache()
      loadAnimals.mockClear()
      listSources.mockClear()
      animals = [MILO]
      const prompt = promptNotificationsIfReminders.mockImplementation(async () => {
        expect(wrapper.find('.home-welcome').exists()).toBe(false)
        return false
      })

      await choisirFichier(wrapper, importFixtureJson())

      expect(importData).toHaveBeenCalledWith(expect.anything(), 'replace')
      expect(loadAnimals).toHaveBeenCalledOnce()
      expect(listSources).toHaveBeenCalledOnce()
      expect(wrapper.find('.home-header').exists()).toBe(true)
      expect(prompt).toHaveBeenCalledWith(router, 'home')
    })

    it('explique un fichier refusé dans la feuille, sans quitter la bienvenue', async () => {
      const wrapper = await monterAttache()

      await choisirFichier(wrapper, 'pas du JSON')

      expect(
        document.body.querySelector('.import-sheet.v-overlay--active [role="alert"]')?.textContent,
      ).toContain('Ce fichier n’est pas un export MémoPatte.')
      expect(wrapper.find('.home-welcome').exists()).toBe(true)
      expect(importData).not.toHaveBeenCalled()
      expect(promptNotificationsIfReminders).not.toHaveBeenCalled()
    })
  })
})

describe('HomeView — Actions rapides', () => {
  beforeEach(() => {
    // jsdom ne fournit pas `visualViewport`, que VDialog écoute pour suivre le clavier.
    vi.stubGlobal('visualViewport', {
      addEventListener() {},
      removeEventListener() {},
      width: 412,
      height: 915,
      offsetTop: 0,
    })
  })

  function tuiles(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.home-quick-tile').map((tuile) => ({
      label: tuile.get('.home-quick-tile__label').text(),
      icon: tuile.findComponent({ name: 'VIcon' }).props('icon'),
    }))
  }

  async function taper(wrapper: ReturnType<typeof mount>, index: number) {
    await wrapper.findAll('.home-quick-tile')[index]!.trigger('click')
    await flushPromises()
  }

  // La feuille de choix est téléportée hors du composant : on clique dans le document.
  async function choisir(nom: string) {
    const ligne = [
      ...document.body.querySelectorAll<HTMLElement>('.animal-picker-sheet__animal'),
    ].find((element) => element.textContent?.trim() === nom)
    if (!ligne) throw new Error(`Ligne ${nom} absente de la feuille`)
    ligne.click()
    await flushPromises()
  }

  async function selectionner(wrapper: ReturnType<typeof mount>, index: number) {
    await wrapper.findAll('.animal-chip')[index]!.trigger('click')
    await flushPromises()
  }

  it('affiche trois tuiles sous « À faire » sur A1, icône puis libellé', async () => {
    sources = [CHPPIL_MILO_RETARD]
    const wrapper = await monter()

    expect(wrapper.get('.home-quick-actions__title').text()).toBe('Actions rapides')
    expect(tuiles(wrapper)).toEqual([
      { label: 'Nouveau traitement', icon: 'ms:medication' },
      { label: 'Rappel de vaccin', icon: 'ms:vaccines' },
      { label: 'Ajouter un poids', icon: 'ms:monitor_weight' },
    ])
    const sections = wrapper
      .findAll('section')
      .map((section) => section.classes().find((name) => name.startsWith('home-')))
    expect(sections).toEqual(['home-todo', 'home-quick-actions'])
  })

  it('rend chaque tuile comme un bouton natif, sans élément de bloc à l’intérieur', async () => {
    const wrapper = await monter()

    for (const tuile of wrapper.findAll('.home-quick-tile')) {
      expect(tuile.element.tagName).toBe('BUTTON')
      expect(tuile.attributes('type')).toBe('button')
      expect(tuile.find('div').exists()).toBe(false)
    }
  })

  it('reste présente sur A2, A3 et A4', async () => {
    sources = [CHPPIL_MILO_RETARD]
    const wrapper = await monter()
    await selectionner(wrapper, 0)
    expect(wrapper.findAll('.home-quick-tile')).toHaveLength(3)

    await selectionner(wrapper, 1)
    expect(wrapper.find('.home-up-to-date').exists()).toBe(true)
    expect(wrapper.findAll('.home-quick-tile')).toHaveLength(3)

    sources = []
    const a4 = await monter()
    expect(a4.find('.home-up-to-date').exists()).toBe(true)
    expect(a4.findAll('.home-quick-tile')).toHaveLength(3)
  })

  it('est absente sur A5', async () => {
    animals = []
    const wrapper = await monter()

    expect(wrapper.find('.home-quick-actions').exists()).toBe(false)
    expect(wrapper.findComponent(WeightSheet).exists()).toBe(false)
  })

  it('ouvre le formulaire traitement de l’animal sélectionné en un tap', async () => {
    const wrapper = await monter()
    await selectionner(wrapper, 1)

    await taper(wrapper, 0)

    expect(push).toHaveBeenCalledWith({ name: 'treatment-new', params: { animalId: LUNA.id } })
    expect(wrapper.getComponent(AnimalPickerSheet).props('modelValue')).toBe(false)
  })

  it('ouvre le formulaire vaccin du seul animal du foyer sans rien demander', async () => {
    animals = [MILO]
    const wrapper = await monter()

    await taper(wrapper, 1)

    expect(push).toHaveBeenCalledWith({ name: 'vaccination-new', params: { animalId: MILO.id } })
    expect(wrapper.getComponent(AnimalPickerSheet).props('modelValue')).toBe(false)
  })

  it('demande l’animal quand plusieurs et aucun sélectionné, puis ouvre son formulaire', async () => {
    const wrapper = await monter()

    await taper(wrapper, 1)

    const picker = wrapper.getComponent(AnimalPickerSheet)
    expect(push).not.toHaveBeenCalled()
    expect(picker.props('modelValue')).toBe(true)
    expect(picker.props('animals')).toEqual([
      { id: MILO.id, name: 'Milo', photoUrl: null },
      { id: LUNA.id, name: 'Luna', photoUrl: null },
    ])

    await choisir('Luna')

    expect(push).toHaveBeenCalledWith({ name: 'vaccination-new', params: { animalId: LUNA.id } })
  })

  it('mène au formulaire traitement depuis la feuille de choix', async () => {
    const wrapper = await monter()

    await taper(wrapper, 0)
    await choisir('Milo')

    expect(push).toHaveBeenCalledWith({ name: 'treatment-new', params: { animalId: MILO.id } })
  })

  it('rend le focus à la tuile quand la feuille de choix se ferme par sa poignée', async () => {
    vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
    const wrapper = mount(HomeView, {
      global: { plugins: [vuetify, i18n, router] },
      attachTo: document.body,
    })
    mounted.push(wrapper)
    await flushPromises()
    const tuile = wrapper.findAll<HTMLButtonElement>('.home-quick-tile')[1]!.element
    tuile.focus()
    tuile.click()
    await flushPromises()

    document.body.querySelector<HTMLElement>('.animal-picker-sheet .bottom-sheet__handle')!.click()
    await flushPromises()

    expect(document.activeElement).toBe(tuile)
  })

  it('ouvre la feuille de pesée sans animal quand aucun n’est sélectionné', async () => {
    const wrapper = await monter()
    const sheet = wrapper.getComponent(WeightSheet)
    expect(sheet.props('modelValue')).toBe(false)

    await taper(wrapper, 2)

    expect(sheet.props('modelValue')).toBe(true)
    expect(sheet.props('animalId')).toBeNull()
    expect(wrapper.getComponent(AnimalPickerSheet).props('modelValue')).toBe(false)
  })

  it('ouvre la feuille de pesée pour l’animal sélectionné', async () => {
    const wrapper = await monter()
    await selectionner(wrapper, 0)

    await taper(wrapper, 2)

    const sheet = wrapper.getComponent(WeightSheet)
    expect(sheet.props('modelValue')).toBe(true)
    expect(sheet.props('animalId')).toBe(MILO.id)
  })

  it('ouvre la feuille de pesée du seul animal du foyer, sans sélecteur et clavier sur le poids', async () => {
    animals = [MILO]
    const wrapper = mount(HomeView, {
      global: { plugins: [vuetify, i18n, router] },
      attachTo: document.body,
    })
    mounted.push(wrapper)
    await flushPromises()

    await taper(wrapper, 2)

    const feuille = document.body.querySelector<HTMLElement>('.weight-sheet .bottom-sheet__panel')
    expect(wrapper.getComponent(WeightSheet).props('animalId')).toBe(MILO.id)
    expect(feuille?.querySelector('.bottom-sheet__subtitle')?.textContent?.trim()).toBe('Pour Milo')
    expect(feuille?.querySelector('.animal-chip-selector')).toBeNull()
    expect(document.activeElement).toBe(feuille?.querySelector('#weight-sheet-kg'))
  })
})

describe('HomeView — feuille d’un rappel', () => {
  beforeEach(() => {
    sources = [VERMIFUGE_LUNA_AUJOURDHUI, CHPPIL_MILO_RETARD]
    vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
    const dates = {
      createdAt: '2026-09-01T09:00:00.000Z',
      updatedAt: '2026-09-01T09:00:00.000Z',
      deletedAt: null,
    }
    vi.spyOn(useTreatmentsStore(), 'getById').mockResolvedValue({
      id: VERMIFUGE_LUNA_AUJOURDHUI.id,
      animalId: LUNA.id,
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 1, unit: 'month' },
      lastDoseDate: '2026-08-09',
      nextDueDate: '2026-09-09',
      stoppedOn: null,
      ...dates,
    })
    vi.spyOn(useVaccinationsStore(), 'getById').mockResolvedValue({
      id: CHPPIL_MILO_RETARD.id,
      animalId: MILO.id,
      name: 'CHPPiL',
      lastInjectionDate: '2025-09-07',
      dueDate: '2026-09-07',
      ...dates,
    })
  })

  it('rend chaque ligne touchable, nommée pour le lecteur d’écran', async () => {
    const wrapper = await monter()

    const lignes = wrapper.findAll('.reminder-row')
    expect(lignes.map((ligne) => ligne.element.tagName)).toEqual(['BUTTON', 'BUTTON'])
    expect(lignes.map((ligne) => ligne.attributes('aria-label'))).toEqual([
      'CHPPiL, vaccin, Milo, en retard de 2 jours. Ouvre les actions.',
      'Milbemax, vermifuge, Luna, aujourd’hui. Ouvre les actions.',
    ])
    expect(lignes[0]!.find('.reminder-row__chevron').exists()).toBe(true)
  })

  it('ouvre la feuille du traitement touché', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.reminder-row')[1]!.trigger('click')

    const feuille = wrapper.getComponent(TreatmentReminderSheet)
    expect(feuille.props('modelValue')).toBe(true)
    expect(feuille.props('treatmentId')).toBe(VERMIFUGE_LUNA_AUJOURDHUI.id)
    expect(wrapper.getComponent(VaccinationReminderSheet).props('modelValue')).toBe(false)
  })

  it('ouvre la feuille du vaccin touché', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.reminder-row')[0]!.trigger('click')

    const feuille = wrapper.getComponent(VaccinationReminderSheet)
    expect(feuille.props('modelValue')).toBe(true)
    expect(feuille.props('vaccinationId')).toBe(CHPPIL_MILO_RETARD.id)
    expect(wrapper.getComponent(TreatmentReminderSheet).props('modelValue')).toBe(false)
  })

  it('rouvre la feuille du rappel au retour de « Modifier », puis l’efface de l’adresse', async () => {
    await router.replace({
      name: 'home',
      query: { reminder: `treatment:${VERMIFUGE_LUNA_AUJOURDHUI.id}` },
    })

    const wrapper = await monter()

    const feuille = wrapper.getComponent(TreatmentReminderSheet)
    expect(feuille.props('modelValue')).toBe(true)
    expect(feuille.props('treatmentId')).toBe(VERMIFUGE_LUNA_AUJOURDHUI.id)
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({}))
  })

  it('rouvre aussi la feuille d’un vaccin', async () => {
    await router.replace({
      name: 'home',
      query: { reminder: `vaccination:${CHPPIL_MILO_RETARD.id}` },
    })

    const wrapper = await monter()

    expect(wrapper.getComponent(VaccinationReminderSheet).props()).toMatchObject({
      modelValue: true,
      vaccinationId: CHPPIL_MILO_RETARD.id,
    })
  })

  it('ne rouvre rien quand le rappel modifié a quitté « À faire »', async () => {
    sources = [{ ...VERMIFUGE_LUNA_AUJOURDHUI, dueDate: '2026-12-01' }, CHPPIL_MILO_RETARD]
    await router.replace({
      name: 'home',
      query: { reminder: `treatment:${VERMIFUGE_LUNA_AUJOURDHUI.id}` },
    })

    const wrapper = await monter()

    expect(wrapper.getComponent(TreatmentReminderSheet).props('modelValue')).toBe(false)
    expect(wrapper.getComponent(VaccinationReminderSheet).props('modelValue')).toBe(false)
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({}))
  })

  it('relit les rappels quand une feuille a noté, arrêté ou annulé', async () => {
    const wrapper = await monter()
    expect(listSources).toHaveBeenCalledOnce()

    wrapper.getComponent(TreatmentReminderSheet).vm.$emit('changed')
    await flushPromises()
    wrapper.getComponent(VaccinationReminderSheet).vm.$emit('changed')
    await flushPromises()

    expect(listSources).toHaveBeenCalledTimes(3)
  })
})
