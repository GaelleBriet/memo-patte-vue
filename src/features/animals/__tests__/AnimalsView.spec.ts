import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import AnimalsView from '../AnimalsView.vue'
import type { Animal } from '../animal.schema'
import { useAnimalsStore } from '../animals.store'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'

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

let store: ReturnType<typeof useAnimalsStore>
let load: MockInstance
let push: MockInstance

beforeEach(async () => {
  setActivePinia(createPinia())
  store = useAnimalsStore()
  load = vi.spyOn(store, 'load').mockResolvedValue(true)
  await router.push({ name: 'animals' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function monter() {
  return mount(AnimalsView, { global: { plugins: [vuetify, i18n, router] } })
}

describe('AnimalsView', () => {
  it('charge la liste des animaux au montage', () => {
    monter()

    expect(load).toHaveBeenCalledOnce()
  })

  it('rend une chip par animal du store', async () => {
    store.animals = [animal('milo', 'Milo'), animal('luna', 'Luna')]
    const wrapper = monter()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.animal-chip').map((chip) => chip.text())).toEqual(['Milo', 'Luna'])
  })

  it('mène au formulaire de création en un tap sur la chip « + »', async () => {
    const wrapper = monter()

    await wrapper.get('.animal-chip-selector__add').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-new' })
  })
})
