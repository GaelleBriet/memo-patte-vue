import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'

import {
  useAnimalSectionLoad,
  type AnimalSectionStore,
} from '../composables/use-animal-section-load'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

function deferred() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>((done) => (resolve = done))
  return { promise, resolve }
}

const mounted: ReturnType<typeof mount>[] = []

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

function fakeStore(load: (store: AnimalSectionStore, id: string) => Promise<boolean>) {
  const store: AnimalSectionStore & { animalId: string | null; error: Error | null } = reactive({
    animalId: null as string | null,
    error: null as Error | null,
    loadForAnimal(id: string) {
      store.animalId = id
      return load(store, id)
    },
  })
  return store
}

function mountWith(store: AnimalSectionStore) {
  const animalId = ref(MILO)
  let api!: ReturnType<typeof useAnimalSectionLoad>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useAnimalSectionLoad(() => animalId.value, store)
        return () => h('p')
      },
    }),
  )
  mounted.push(wrapper)
  return { animalId, api: () => api }
}

describe('useAnimalSectionLoad', () => {
  it('rend la liste courante une fois l’animal chargé sans erreur', async () => {
    const pending = deferred()
    const { api } = mountWith(fakeStore(() => pending.promise))

    expect(api().isCurrent.value).toBe(false)
    expect(api().hasError.value).toBe(false)

    pending.resolve(true)
    await flushPromises()

    expect(api().isCurrent.value).toBe(true)
    expect(api().hasError.value).toBe(false)
  })

  it('signale l’erreur du store après un chargement raté, sans liste courante', async () => {
    const store = fakeStore(async (current) => {
      current.error = new Error('base fermée')
      return false
    })
    const { api } = mountWith(store)
    await flushPromises()

    expect(api().isCurrent.value).toBe(false)
    expect(api().hasError.value).toBe(true)
  })

  it('au changement d’animal, ni liste ni erreur tant que le nouvel animal n’est pas chargé', async () => {
    const pendings: ReturnType<typeof deferred>[] = []
    const store = fakeStore(() => {
      const pending = deferred()
      pendings.push(pending)
      return pending.promise
    })
    const { animalId, api } = mountWith(store)
    pendings[0]!.resolve(true)
    await flushPromises()
    expect(api().isCurrent.value).toBe(true)

    animalId.value = LUNA
    await flushPromises()
    expect(api().isCurrent.value).toBe(false)
    expect(api().hasError.value).toBe(false)

    pendings[1]!.resolve(true)
    await flushPromises()
    expect(api().isCurrent.value).toBe(true)
  })

  it('une liste d’un autre animal dans le store n’est jamais courante', async () => {
    const store = fakeStore(async () => true)
    const { api } = mountWith(store)
    await flushPromises()

    store.animalId = LUNA

    expect(api().isCurrent.value).toBe(false)
    expect(api().hasError.value).toBe(false)
  })
})
