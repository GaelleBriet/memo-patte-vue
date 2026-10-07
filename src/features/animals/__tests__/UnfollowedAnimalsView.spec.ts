import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import UnfollowedAnimalsView from '../views/UnfollowedAnimalsView.vue'
import type { Animal } from '../schema/animal.schema'
import { useAnimalsStore } from '../store/animals.store'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

vi.mock('@/core/photos/photo-storage', () => ({
  savePhoto: vi.fn<(base64: string) => Promise<string>>(),
  deletePhoto: vi.fn<(name: string) => Promise<void>>(),
  photoDisplayUrl: vi.fn<(name: string) => Promise<string>>(async (name) => `url:${name}`),
}))

const Vide = { render: () => null }
const TODAY = new Date('2026-09-30T12:00:00')

function animal(id: string, name: string, overrides: Partial<Animal> = {}): Animal {
  return {
    id,
    name,
    species: 'cat',
    breed: null,
    birthDate: null,
    birthDateApproximate: false,
    photoPath: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    deletedAt: null,
    unfollowedOn: '2026-09-28',
    departureReason: null,
    departureDate: null,
    ...overrides,
  }
}

const MILO = animal('11111111-1111-4111-8111-111111111111', 'Milo', { unfollowedOn: null })
const LUNA = animal('33333333-3333-4333-8333-333333333333', 'Luna', {
  departureReason: 'death',
  departureDate: '2026-09-28',
})
const PIXEL = animal('55555555-5555-4555-8555-555555555555', 'Pixel', {
  breed: 'Européenne',
  birthDate: '2020-03-01',
})

let routeur: Router
let replace: MockInstance
const wrappers: VueWrapper[] = []

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
  setActivePinia(createPinia())
  const store = useAnimalsStore()
  vi.spyOn(store, 'load').mockImplementation(async () => {
    store.animals = [MILO, LUNA, PIXEL]
    store.hasLoaded = true
    return true
  })
  routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/animals', name: 'animals', component: Vide },
      { path: '/animals/unfollowed', name: 'unfollowed-animals', component: Vide },
    ],
  })
  await routeur.push('/animals/unfollowed')
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  applyLocale('fr')
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function monter() {
  const wrapper = mount(UnfollowedAnimalsView, {
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

describe('UnfollowedAnimalsView — liste des animaux qu’on ne suit plus (AN-10)', () => {
  it('liste les seuls animaux qu’on ne suit plus, dans l’ordre du carnet', async () => {
    const wrapper = await monter()

    expect(texte(wrapper.get('.pushed-screen__title'))).toBe('Animaux que tu ne suis plus')
    expect(wrapper.findAll('.unfollowed-animal__name').map(texte)).toEqual(['Luna', 'Pixel'])
  })

  it('reprend le sous-titre du carnet : « jusqu’au … », ou race et âge, jamais le motif', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.unfollowed-animal__subtitle').map(texte)).toEqual([
      'jusqu’au 28 sept. 2026',
      'Européenne · 6 ans',
    ])
    expect(wrapper.text()).not.toContain('Décès')
  })

  it('ouvre le carnet de l’animal touché', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.unfollowed-animal')[1]!.trigger('click')

    expect(useAnimalsStore().selectedAnimalId).toBe(PIXEL.id)
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
    expect(wrapper.findAll('.unfollowed-animal')[1]!.attributes('aria-label')).toBe(
      'Ouvrir le carnet de Pixel',
    )
  })

  it('revient au Carnet par la flèche', async () => {
    const wrapper = await monter()

    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('s’écrit en anglais', async () => {
    applyLocale('en')

    const wrapper = await monter()

    expect(texte(wrapper.get('.pushed-screen__title'))).toBe('Pets you no longer follow')
    expect(texte(wrapper.get('.unfollowed-animal__subtitle'))).toBe('until Sep 28, 2026')
  })
})
