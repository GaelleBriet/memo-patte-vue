import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import CarnetView from '../CarnetView.vue'
import type { Animal } from '../animal.schema'
import { useAnimalsStore } from '../animals.store'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import AnimalChipSelector from '@/shared/AnimalChipSelector.vue'
import type { Treatment } from '@/features/treatments/treatment.schema'
import type { TreatmentsRepository } from '@/features/treatments/treatments.repository'
import { provideTreatmentsRepository } from '@/features/treatments/treatments.store'
import TreatmentsSection from '@/features/treatments/TreatmentsSection.vue'
import type { Vaccination } from '@/features/vaccinations/vaccination.schema'
import type { VaccinationsRepository } from '@/features/vaccinations/vaccinations.repository'
import { provideVaccinationsRepository } from '@/features/vaccinations/vaccinations.store'
import VaccinationsSection from '@/features/vaccinations/VaccinationsSection.vue'
import type { WeightEntry } from '@/features/weight/weight.schema'
import type { WeightRepository } from '@/features/weight/weight.repository'
import { provideWeightRepository } from '@/features/weight/weight.store'
import WeightSection from '@/features/weight/WeightSection.vue'

const TODAY = new Date('2026-09-09T12:00:00')

function animal(id: string, name: string, overrides: Partial<Animal> = {}): Animal {
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
    ...overrides,
  }
}

const MILO = animal('11111111-1111-4111-8111-111111111111', 'Milo', {
  breed: 'Golden retriever',
  birthDate: '2022-03-12',
})
const LUNA = animal('33333333-3333-4333-8333-333333333333', 'Luna', { species: 'cat' })

const STAMPS = {
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

function vaccination(animalId: string, dueDate: string | null): Vaccination {
  return {
    id: crypto.randomUUID(),
    animalId,
    name: 'Rage',
    lastInjectionDate: '2025-12-12',
    dueDate,
    ...STAMPS,
  }
}

function treatment(animalId: string, nextDueDate: string): Treatment {
  return {
    id: crypto.randomUUID(),
    animalId,
    name: 'Bravecto',
    type: 'antiparasitic',
    frequency: { value: 3, unit: 'month' },
    lastDoseDate: '2026-06-24',
    nextDueDate,
    ...STAMPS,
  }
}

function weight(animalId: string, weightKg: number, measuredOn: string): WeightEntry {
  return { id: crypto.randomUUID(), animalId, weightKg, measuredOn, ...STAMPS }
}

let store: ReturnType<typeof useAnimalsStore>
let animals: Animal[]
let vaccinations: Vaccination[]
let treatments: Treatment[]
let weights: WeightEntry[]
let load: MockInstance
let push: MockInstance

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
  setActivePinia(createPinia())
  store = useAnimalsStore()
  animals = [MILO, LUNA]
  vaccinations = []
  treatments = []
  weights = []
  load = vi.spyOn(store, 'load').mockImplementation(async () => {
    store.animals = animals
    store.hasLoaded = true
    return true
  })
  provideVaccinationsRepository(() => ({
    listByAnimal: vi.fn<VaccinationsRepository['listByAnimal']>(async (id) =>
      vaccinations.filter((v) => v.animalId === id),
    ),
    getById: vi.fn<VaccinationsRepository['getById']>(),
    create: vi.fn<VaccinationsRepository['create']>(),
    update: vi.fn<VaccinationsRepository['update']>(),
    remove: vi.fn<VaccinationsRepository['remove']>(),
  }))
  provideTreatmentsRepository(() => ({
    listByAnimal: vi.fn<TreatmentsRepository['listByAnimal']>(async (id) =>
      treatments.filter((t) => t.animalId === id),
    ),
    getById: vi.fn<TreatmentsRepository['getById']>(),
    create: vi.fn<TreatmentsRepository['create']>(),
    update: vi.fn<TreatmentsRepository['update']>(),
    remove: vi.fn<TreatmentsRepository['remove']>(),
  }))
  provideWeightRepository(() => ({
    listByAnimal: vi.fn<WeightRepository['listByAnimal']>(async (id) =>
      weights.filter((w) => w.animalId === id),
    ),
    create: vi.fn<WeightRepository['create']>(),
    update: vi.fn<WeightRepository['update']>(),
    remove: vi.fn<WeightRepository['remove']>(),
  }))
  await router.push({ name: 'animals' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  provideVaccinationsRepository(null)
  provideTreatmentsRepository(null)
  provideWeightRepository(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function monter() {
  const wrapper = mount(CarnetView, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

function stat(wrapper: ReturnType<typeof mount>, index: number) {
  const column = wrapper.findAll('.carnet-stat')[index]
  if (!column) throw new Error(`Pas de colonne de stats à l'index ${index}`)
  return {
    column,
    label: column.get('.carnet-stat__label').text(),
    value: column.get('.carnet-stat__value').text(),
    sub: column.get('.carnet-stat__sub').text(),
  }
}

describe('CarnetView — animal consulté', () => {
  it('charge la liste des animaux au montage', async () => {
    await monter()

    expect(load).toHaveBeenCalledOnce()
  })

  it('sélectionne le premier animal quand aucun ne l’est', async () => {
    await monter()

    expect(store.selectedAnimalId).toBe(MILO.id)
  })

  it('garde l’animal déjà sélectionné', async () => {
    store.select(LUNA.id)

    const wrapper = await monter()

    expect(store.selectedAnimalId).toBe(LUNA.id)
    expect(wrapper.get('.carnet-header__name').text()).toBe('Luna')
  })

  it('rend une chip par animal, en mode switch', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.animal-chip').map((chip) => chip.text())).toEqual(['Milo', 'Luna'])
    expect(wrapper.getComponent(AnimalChipSelector).props('mode')).toBe('switch')
  })

  it('change l’animal consulté au tap sur une chip et le passe aux trois sections', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.animal-chip')[1]!.trigger('click')
    await flushPromises()

    expect(store.selectedAnimalId).toBe(LUNA.id)
    expect(wrapper.get('.carnet-header__name').text()).toBe('Luna')
    expect(wrapper.getComponent(VaccinationsSection).props('animalId')).toBe(LUNA.id)
    expect(wrapper.getComponent(TreatmentsSection).props('animalId')).toBe(LUNA.id)
    expect(wrapper.getComponent(WeightSection).props('animalId')).toBe(LUNA.id)
  })

  it('mène au formulaire de création en un tap sur la chip « + »', async () => {
    const wrapper = await monter()

    await wrapper.get('.animal-chip-selector__add').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-new' })
  })
})

describe('CarnetView — header', () => {
  it('affiche nom, race et âge, l’avatar en dégradé', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__name').text()).toBe('Milo')
    expect(wrapper.get('.carnet-header__subtitle').text()).toBe('Golden retriever · 4 ans')
    expect(wrapper.get('.carnet-header__avatar').attributes('style')).toContain('linear-gradient')
  })

  it('passe la date du jour aux sections', async () => {
    const wrapper = await monter()

    expect(wrapper.getComponent(VaccinationsSection).props('today')).toBe('2026-09-09')
    expect(wrapper.getComponent(TreatmentsSection).props('today')).toBe('2026-09-09')
  })

  it('n’écrit que la race sans date de naissance', async () => {
    animals = [animal('a', 'Nino', { breed: 'Européen' })]
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__subtitle').text()).toBe('Européen')
  })

  it('n’écrit que l’âge sans race, en mois sous un an', async () => {
    animals = [animal('a', 'Nino', { birthDate: '2026-03-09' })]
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__subtitle').text()).toBe('6 mois')
  })

  it('n’affiche pas de sous-titre sans race ni date de naissance', async () => {
    animals = [animal('a', 'Nino')]
    const wrapper = await monter()

    expect(wrapper.find('.carnet-header__subtitle').exists()).toBe(false)
  })

  it('ouvre l’édition de la fiche depuis l’icône edit', async () => {
    const wrapper = await monter()

    await wrapper.get('.carnet-header__edit').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-edit', params: { id: MILO.id } })
  })

  it('revient à l’accueil par la flèche', async () => {
    const wrapper = await monter()

    await wrapper.get('.carnet-header__back').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'home' })
  })
})

describe('CarnetView — bandeau de stats', () => {
  it('a trois colonnes Poids / Rappels / Traitements', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.carnet-stat').map((c) => c.get('.carnet-stat__label').text())).toEqual(
      ['Poids', 'Rappels', 'Traitements'],
    )
  })

  it('met tout à — / 0 / 0 sans donnée (C2)', async () => {
    const wrapper = await monter()

    expect(stat(wrapper, 0)).toMatchObject({ value: '—', sub: 'Aucune pesée' })
    expect(stat(wrapper, 1)).toMatchObject({ value: '0', sub: 'à venir' })
    expect(stat(wrapper, 2)).toMatchObject({ value: '0', sub: 'en cours' })
    expect(stat(wrapper, 1).column.classes()).not.toContain('carnet-stat--overdue')
  })

  it('affiche la dernière pesée et son delta', async () => {
    weights = [weight(MILO.id, 24, '2026-08-05'), weight(MILO.id, 24.5, '2026-11-08')]
    const wrapper = await monter()

    expect(stat(wrapper, 0)).toMatchObject({ value: '24,5 kg', sub: '+0,5 kg vs août' })
  })

  it('signale une première pesée', async () => {
    weights = [weight(MILO.id, 24.5, '2026-11-08')]
    const wrapper = await monter()

    expect(stat(wrapper, 0)).toMatchObject({ value: '24,5 kg', sub: 'Première pesée' })
  })

  it('compte les retards, vaccins et traitements confondus, en corail, dès qu’il y en a un', async () => {
    vaccinations = [vaccination(MILO.id, '2026-09-01'), vaccination(MILO.id, null)]
    treatments = [treatment(MILO.id, '2026-09-24'), treatment(LUNA.id, '2026-09-01')]
    const wrapper = await monter()

    expect(stat(wrapper, 1)).toMatchObject({ value: '1', sub: 'en retard' })
    expect(stat(wrapper, 1).column.classes()).toContain('carnet-stat--overdue')
    expect(stat(wrapper, 2)).toMatchObject({ value: '1', sub: 'en cours' })
  })

  it('compte les rappels à venir, en neutre, quand rien n’est en retard', async () => {
    vaccinations = [vaccination(MILO.id, '2026-12-12'), vaccination(MILO.id, null)]
    treatments = [treatment(MILO.id, '2026-09-09')]
    const wrapper = await monter()

    expect(stat(wrapper, 1)).toMatchObject({ value: '2', sub: 'à venir' })
    expect(stat(wrapper, 1).column.classes()).not.toContain('carnet-stat--overdue')
  })

  it('ne compte que les retards dès qu’il y en a, pas les rappels à venir avec', async () => {
    vaccinations = [vaccination(MILO.id, '2026-09-01'), vaccination(MILO.id, '2026-12-12')]
    treatments = [treatment(MILO.id, '2026-09-02'), treatment(MILO.id, '2026-09-24')]
    const wrapper = await monter()

    expect(stat(wrapper, 1)).toMatchObject({ value: '2', sub: 'en retard' })
  })

  it('suit l’animal consulté', async () => {
    treatments = [treatment(LUNA.id, '2026-09-24')]
    const wrapper = await monter()
    expect(stat(wrapper, 2).value).toBe('0')

    await wrapper.findAll('.animal-chip')[1]!.trigger('click')
    await flushPromises()

    expect(stat(wrapper, 2).value).toBe('1')
  })
})

describe('CarnetView — sans animal', () => {
  beforeEach(() => {
    animals = []
  })

  it('souhaite la bienvenue et propose de créer le premier animal', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.carnet-welcome__title').text()).toBe('Bienvenue sur MémoPatte')
    expect(wrapper.get('.carnet-welcome__create').text()).toBe('Créer mon premier animal')
    expect(wrapper.find('.carnet-header').exists()).toBe(false)
    expect(wrapper.find('.carnet-stat').exists()).toBe(false)
    expect(wrapper.findComponent(VaccinationsSection).exists()).toBe(false)
  })

  it('ouvre le formulaire de création', async () => {
    const wrapper = await monter()

    await wrapper.get('.carnet-welcome__create').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-new' })
  })

  it('n’affiche rien tant que la liste n’est pas chargée', async () => {
    load.mockReturnValueOnce(new Promise(() => {}))
    const wrapper = await monter()

    expect(wrapper.find('.carnet-welcome').exists()).toBe(false)
    expect(wrapper.find('.carnet-header').exists()).toBe(false)
  })
})

describe('CarnetView — route', () => {
  it('reste l’onglet Carnet, à /animals', () => {
    const route = router.resolve('/animals')

    expect(route.name).toBe('animals')
  })
})
