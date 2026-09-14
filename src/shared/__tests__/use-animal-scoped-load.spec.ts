import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { useAnimalScopedLoad } from '../use-animal-scoped-load'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

type Load = (id: string) => Promise<boolean>

function deferred() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>((done) => (resolve = done))
  return { promise, resolve }
}

const mounted: ReturnType<typeof mount>[] = []

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

function mountWith(load: Load) {
  const animalId = ref(MILO)
  let api!: ReturnType<typeof useAnimalScopedLoad>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useAnimalScopedLoad(() => animalId.value, load)
        return () => h('p')
      },
    }),
  )
  mounted.push(wrapper)
  return { animalId, api: () => api }
}

describe('useAnimalScopedLoad', () => {
  it('charge l’animal au montage et le marque chargé une fois le chargement réussi', async () => {
    const pending = deferred()
    const load = vi.fn<Load>(() => pending.promise)
    const { api } = mountWith(load)

    expect(load).toHaveBeenCalledExactlyOnceWith(MILO)
    expect(api().isLoading.value).toBe(true)
    expect(api().loadedFor.value).toBeNull()

    pending.resolve(true)
    await flushPromises()

    expect(api().isLoading.value).toBe(false)
    expect(api().loadedFor.value).toBe(MILO)
  })

  it('marque l’animal chargé même après un échec : c’est l’erreur du store qui masque la liste', async () => {
    const { api } = mountWith(vi.fn<Load>(async () => false))
    await flushPromises()

    expect(api().loadedFor.value).toBe(MILO)
    expect(api().isLoading.value).toBe(false)
  })

  it('masque l’animal précédent dès qu’on en change', async () => {
    const load = vi.fn<Load>(async () => true)
    const { animalId, api } = mountWith(load)
    await flushPromises()
    load.mockReturnValueOnce(new Promise(() => {}))

    animalId.value = LUNA
    await flushPromises()

    expect(load).toHaveBeenLastCalledWith(LUNA)
    expect(api().loadedFor.value).toBeNull()
    expect(api().isLoading.value).toBe(true)
  })

  it('relit le même animal au retour au premier plan sans le masquer pendant la relecture', async () => {
    const load = vi.fn<Load>(async () => true)
    const { api } = mountWith(load)
    await flushPromises()
    load.mockReturnValueOnce(new Promise(() => {}))

    simulateWebResume()
    await flushPromises()

    expect(load).toHaveBeenCalledTimes(2)
    expect(api().loadedFor.value).toBe(MILO)
    expect(api().isLoading.value).toBe(false)
  })

  it('ignore la réponse d’un animal quitté entre-temps', async () => {
    const milo = deferred()
    const luna = deferred()
    const load = vi.fn<Load>((id) => (id === MILO ? milo.promise : luna.promise))
    const { animalId, api } = mountWith(load)

    animalId.value = LUNA
    await flushPromises()
    milo.resolve(true)
    await flushPromises()

    expect(api().loadedFor.value).toBeNull()
    expect(api().isLoading.value).toBe(true)

    luna.resolve(true)
    await flushPromises()

    expect(api().loadedFor.value).toBe(LUNA)
    expect(api().isLoading.value).toBe(false)
  })
})
