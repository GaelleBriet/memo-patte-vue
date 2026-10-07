import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import AnimalDepartureView from '../views/AnimalDepartureView.vue'
import type { Animal } from '../schema/animal.schema'
import { useAnimalsStore } from '../store/animals.store'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

const Vide = { render: () => null }
const TODAY = new Date('2026-09-30T12:00:00')

const LUNA: Animal = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Luna',
  species: 'cat',
  breed: 'Européenne',
  birthDate: null,
  birthDateApproximate: false,
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
  unfollowedOn: '2026-09-28',
  departureReason: null,
  departureDate: null,
}

let animals: Animal[]
let save: MockInstance
let replace: MockInstance
let routeur: Router
const wrappers: VueWrapper[] = []

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
  setActivePinia(createPinia())
  animals = [LUNA]
  const store = useAnimalsStore()
  vi.spyOn(store, 'load').mockImplementation(async () => {
    store.animals = animals
    store.hasLoaded = true
    return true
  })
  save = vi.spyOn(store, 'saveDeparture').mockResolvedValue()
  routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/animals', name: 'animals', component: Vide },
      { path: '/animals/:id/departure', name: 'animal-departure', component: Vide },
    ],
  })
  await routeur.push(`/animals/${LUNA.id}/departure`)
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  applyLocale('fr')
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function monter() {
  const wrapper = mount(AnimalDepartureView, {
    props: { id: LUNA.id },
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

function texte(element: { text(): string }): string {
  return element.text().replace(/\s+/g, ' ').trim()
}

function choix(wrapper: VueWrapper) {
  return wrapper.findAll('.form-choices__choice')
}

function date(wrapper: VueWrapper) {
  return wrapper.get<HTMLInputElement>('#animal-departure-date')
}

async function enregistrer(wrapper: VueWrapper) {
  await wrapper.get('.form-screen__submit').trigger('click')
  await flushPromises()
}

describe('AnimalDepartureView — « Ajouter une date » (V15 quater)', () => {
  it('dit que tout est facultatif, avec le motif et la date du départ', async () => {
    const wrapper = await monter()

    expect(texte(wrapper.get('.pushed-screen__title'))).toBe('Ajouter une date')
    expect(texte(wrapper.get('.pushed-screen__subtitle'))).toBe('Luna')
    expect(texte(wrapper.get('.animal-departure__lead'))).toBe(
      'Tout est facultatif et reste dans le carnet de Luna.',
    )
    expect(choix(wrapper).map(texte)).toEqual(['Décès', 'Chez quelqu’un d’autre', 'Autre'])
    expect(wrapper.text()).toContain('Date du départ')
    expect(wrapper.text()).toContain('Au plus tard aujourd’hui.')
    expect(date(wrapper).attributes('max')).toBe('2026-09-30')
    expect(wrapper.findAll('.form-field__optional')).toHaveLength(2)
  })

  it('enregistre le motif et la date, puis revient au carnet de Luna', async () => {
    const wrapper = await monter()

    await choix(wrapper)[1]!.trigger('click')
    await date(wrapper).setValue('2026-09-28')
    await enregistrer(wrapper)

    expect(save).toHaveBeenCalledExactlyOnceWith(LUNA.id, {
      departureReason: 'rehomed',
      departureDate: '2026-09-28',
    })
    expect(useAnimalsStore().selectedAnimalId).toBe(LUNA.id)
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('AN-10 : refuse une date future, sans rien enregistrer', async () => {
    const wrapper = await monter()

    await date(wrapper).setValue('2026-10-01')
    await enregistrer(wrapper)

    expect(texte(wrapper.get('.form-field__error'))).toBe(
      'La date du départ ne peut pas être dans le futur.',
    )
    expect(save).not.toHaveBeenCalled()
  })

  it('retire le motif touché de nouveau : rien n’est obligatoire', async () => {
    const wrapper = await monter()

    await choix(wrapper)[0]!.trigger('click')
    expect(choix(wrapper)[0]!.attributes('aria-checked')).toBe('true')
    await choix(wrapper)[0]!.trigger('click')
    expect(choix(wrapper).map((choice) => choice.attributes('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ])
    await enregistrer(wrapper)

    expect(save).toHaveBeenCalledExactlyOnceWith(LUNA.id, {
      departureReason: null,
      departureDate: null,
    })
  })

  it('revient au carnet sans rien enregistrer', async () => {
    const wrapper = await monter()

    await wrapper.get('.form-screen__cancel').trigger('click')

    expect(save).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('dit l’échec de l’enregistrement', async () => {
    save.mockRejectedValueOnce(new Error('base verrouillée'))
    const wrapper = await monter()

    await enregistrer(wrapper)

    expect(texte(wrapper.get('.form-screen__save-error'))).toBe(
      'La date n’a pas pu être enregistrée. Réessaie.',
    )
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('AnimalDepartureView — carnet supprimé', () => {
  it('dit que le carnet de l’animal a été supprimé', async () => {
    animals = []

    const wrapper = await monter()

    expect(texte(wrapper.get('.form-screen__save-error'))).toBe(
      'Le carnet de cet animal a été supprimé.',
    )
  })

  it('le dit en anglais', async () => {
    applyLocale('en')
    animals = []

    const wrapper = await monter()

    expect(texte(wrapper.get('.form-screen__save-error'))).toBe(
      'This pet’s health record was deleted.',
    )
  })
})

describe('AnimalDepartureView — « Modifier la date » (V15 quinquies)', () => {
  it('reprend le motif et la date déjà notés', async () => {
    animals = [{ ...LUNA, departureReason: 'death', departureDate: '2026-09-28' }]

    const wrapper = await monter()

    expect(texte(wrapper.get('.pushed-screen__title'))).toBe('Modifier la date')
    expect(choix(wrapper).map((choice) => choice.attributes('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(date(wrapper).element.value).toBe('2026-09-28')
  })

  it('efface la date par « Effacer la date »', async () => {
    animals = [{ ...LUNA, departureReason: 'death', departureDate: '2026-09-28' }]
    const wrapper = await monter()

    await wrapper.get('[aria-label="Effacer la date"]').trigger('click')
    await flushPromises()
    await enregistrer(wrapper)

    expect(save).toHaveBeenCalledExactlyOnceWith(LUNA.id, {
      departureReason: 'death',
      departureDate: null,
    })
  })
})

describe('AnimalDepartureView — anglais', () => {
  it('suit le glossaire', async () => {
    applyLocale('en')

    const wrapper = await monter()

    expect(texte(wrapper.get('.pushed-screen__title'))).toBe('Add a date')
    expect(texte(wrapper.get('.animal-departure__lead'))).toBe(
      'Everything is optional and stays in Luna’s health record.',
    )
    expect(choix(wrapper).map(texte)).toEqual(['Passed away', 'With someone else', 'Other'])
    expect(wrapper.text()).toContain('Reason')
    expect(wrapper.text()).toContain('Departure date')
    expect(wrapper.text()).toContain('Today at the latest.')
  })
})
