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

import HomeView from '../HomeView.vue'
import type { HomeReminderSource, HomeRemindersService } from '../home-reminders.service'
import { provideHomeRemindersService, useHomeStore } from '../home.store'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import type { Animal } from '@/features/animals/animal.schema'
import { useAnimalsStore } from '@/features/animals/animals.store'
import AnimalChipSelector from '@/shared/AnimalChipSelector.vue'

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

afterEach(() => {
  provideHomeRemindersService(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function monter() {
  const wrapper = mount(HomeView, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

function rows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.reminder-row').map((row) => ({
    title: row.get('.reminder-row__title').text(),
    animal: row.find('.reminder-row__animal').exists()
      ? row.get('.reminder-row__animal').text()
      : null,
    badge: row.get('.reminder-row__badge').text(),
    status: [...row.classes()].find((name) => name.startsWith('reminder-row--')) ?? null,
  }))
}

describe('HomeView — chargement et erreur', () => {
  it('charge les animaux et les rappels au montage', async () => {
    await monter()

    expect(loadAnimals).toHaveBeenCalledOnce()
    expect(listSources).toHaveBeenCalledOnce()
  })

  it('affiche un indicateur tant que rien n’est chargé, sous un header vide', async () => {
    loadAnimals.mockImplementation(() => new Promise(() => {}))
    const wrapper = await monter()

    expect(wrapper.find('.home-loading').exists()).toBe(true)
    expect(wrapper.find('.home-header').exists()).toBe(true)
    expect(wrapper.find('.home-header__title').exists()).toBe(false)
  })

  it('propose de réessayer quand la base ne répond pas, et relance les deux chargements', async () => {
    loadAnimals.mockImplementation(async () => {
      animalsStore.error = new Error('base indisponible')
      return false
    })
    const wrapper = await monter()

    expect(wrapper.find('.home-error').exists()).toBe(true)
    expect(wrapper.find('.home-header__title').exists()).toBe(false)
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

  it('rend les chips en mode filtre, sans sélection', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.animal-chip').map((chip) => chip.text())).toEqual(['Milo', 'Luna'])
    expect(wrapper.getComponent(AnimalChipSelector).props('mode')).toBe('filter')
    expect(wrapper.getComponent(AnimalChipSelector).props('selectedId')).toBeNull()
  })

  it('mène au formulaire de création en un tap sur la chip « + »', async () => {
    const wrapper = await monter()

    await wrapper.get('.animal-chip-selector__add').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-new' })
  })

  it('compte les rappels de tous les animaux et signale le retard', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.home-todo__title').text()).toBe('À faire')
    expect(wrapper.get('.home-todo__counter').text()).toBe('3 rappels')
    expect(wrapper.get('.home-overdue-banner').text()).toBe('1 rappel en retard')
  })

  it('liste les rappels dans une seule carte, du plus urgent au moins urgent, avec le nom de l’animal', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.home-reminders')).toHaveLength(1)
    expect(rows(wrapper)).toEqual([
      {
        title: 'Vaccin CHPPiL',
        animal: 'Milo',
        badge: 'En retard · 2 j',
        status: 'reminder-row--overdue',
      },
      { title: 'Vermifuge', animal: 'Luna', badge: 'Aujourd’hui', status: 'reminder-row--today' },
      {
        title: 'Antiparasitaire',
        animal: 'Milo',
        badge: 'Dans 3 jours',
        status: 'reminder-row--later',
      },
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
    expect(wrapper.get('.home-todo__counter').text()).toBe('3 rappels')
    expect(rows(wrapper).map((row) => row.animal)).toEqual(['Milo', 'Luna', 'Milo'])
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
    expect(wrapper.get('.home-todo__counter').text()).toBe('4 rappels')
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
    expect(wrapper.get('.home-todo__counter').text()).toBe('Milo · 2 rappels')
    expect(rows(wrapper)).toEqual([
      {
        title: 'Vaccin CHPPiL',
        animal: null,
        badge: 'En retard · 2 j',
        status: 'reminder-row--overdue',
      },
      {
        title: 'Antiparasitaire',
        animal: null,
        badge: 'Dans 3 jours',
        status: 'reminder-row--later',
      },
    ])
  })

  it('filtre sur Luna sans bandeau quand elle n’a pas de retard', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.animal-chip')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.get('.home-todo__counter').text()).toBe('Luna · 1 rappel')
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
    expect(wrapper.get('.home-todo__counter').text()).toBe('3 rappels')
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

    expect(wrapper.get('.home-todo__counter').text()).toBe('Milo')
    expect(wrapper.find('.home-reminders').exists()).toBe(false)
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

    expect(wrapper.find('.home-todo__counter').exists()).toBe(false)
    expect(wrapper.find('.home-reminders').exists()).toBe(false)
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

describe('HomeView — A5 premier lancement, aucun animal', () => {
  beforeEach(() => {
    animals = []
  })

  it('remplace tout l’écran par la bienvenue, sans header ni chips', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.home-header').exists()).toBe(false)
    expect(wrapper.findComponent(AnimalChipSelector).exists()).toBe(false)
    expect(wrapper.find('.home-todo').exists()).toBe(false)
    expect(wrapper.get('.home-welcome__illustration').attributes('src')).toBeTruthy()
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
})
