import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { useWeightEntries } from '../use-weight-entries'
import type { WeightEntry } from '../weight.schema'
import type { WeightRepository } from '../weight.repository'
import { provideWeightRepository, useWeightStore } from '../weight.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

function entry(animalId: string, weightKg: number): WeightEntry {
  return {
    id: crypto.randomUUID(),
    animalId,
    weightKg,
    measuredOn: '2026-09-01',
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
  }
}

let entries: WeightEntry[]
let listByAnimal: Mock<WeightRepository['listByAnimal']>
const mounted: ReturnType<typeof mount>[] = []

beforeEach(() => {
  setActivePinia(createPinia())
  entries = [entry(MILO, 24.5), entry(LUNA, 4.2)]
  listByAnimal = vi.fn<WeightRepository['listByAnimal']>(async (id) =>
    entries.filter((item) => item.animalId === id),
  )
  provideWeightRepository(() => ({
    listByAnimal,
    create: vi.fn<WeightRepository['create']>(async (input) => {
      const created = { ...entry(input.animalId, input.weightKg), measuredOn: input.measuredOn }
      entries = [...entries, created]
      return created
    }),
    update: vi.fn<WeightRepository['update']>(),
    remove: vi.fn<WeightRepository['remove']>(),
  }))
})

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  provideWeightRepository(null)
})

async function monter() {
  const animalId = ref(MILO)
  let api!: ReturnType<typeof useWeightEntries>
  mounted.push(
    mount(
      defineComponent({
        setup() {
          api = useWeightEntries(() => animalId.value)
          return () => h('p')
        },
      }),
    ),
  )
  await flushPromises()
  return { animalId, api: () => api }
}

describe('useWeightEntries', () => {
  it('garde les pesées affichées pendant la relecture du même animal', async () => {
    const { api } = await monter()
    listByAnimal.mockReturnValueOnce(new Promise(() => {}))

    void api().reload()
    await flushPromises()

    expect(api().entries.value.map((item) => item.weightKg)).toEqual([24.5])
    expect(api().isLoading.value).toBe(false)
    expect(api().isReady.value).toBe(true)
  })

  it('affiche la pesée ajoutée après un chargement en échec', async () => {
    entries = []
    listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const { api } = await monter()
    expect(api().hasError.value).toBe(true)

    await useWeightStore().create({ animalId: MILO, weightKg: 25, measuredOn: '2026-09-09' })
    await flushPromises()

    expect(api().hasError.value).toBe(false)
    expect(api().entries.value.map((item) => item.weightKg)).toEqual([25])
  })

  it('relit les pesées au retour au premier plan', async () => {
    await monter()

    simulateWebResume()
    await flushPromises()

    expect(listByAnimal).toHaveBeenCalledTimes(2)
  })

  it('masque les pesées de l’animal précédent pendant le chargement du suivant', async () => {
    const { animalId, api } = await monter()
    listByAnimal.mockReturnValueOnce(new Promise(() => {}))

    animalId.value = LUNA
    await flushPromises()

    expect(api().entries.value).toEqual([])
    expect(api().isLoading.value).toBe(true)
  })
})
