import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type ComputedRef } from 'vue'

import { useAnimalChips } from '../composables/use-animal-chips'
import type { AnimalChipItem } from '../components/AnimalChipSelector.vue'
import { forgetPhotoUrls } from '@/core/photos/use-photo-urls'

vi.mock('@/core/photos/photo-storage', () => ({
  photoDisplayUrl: vi.fn<(name: string) => Promise<string>>(async (name) => `url:${name}`),
}))

type ChipAnimal = { id: string; name: string; photoPath: string | null }

const mounted: ReturnType<typeof mount>[] = []

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  forgetPhotoUrls()
})

function mountWith(initial: ChipAnimal[]) {
  const animals = ref(initial)
  let chips!: ComputedRef<AnimalChipItem[]>
  mounted.push(
    mount(
      defineComponent({
        setup() {
          chips = useAnimalChips(() => animals.value)
          return () => h('p')
        },
      }),
    ),
  )
  return { animals, chips: () => chips.value }
}

describe('useAnimalChips', () => {
  it('garde l’ordre reçu et résout chaque photo', async () => {
    const { chips } = mountWith([
      { id: 'milo', name: 'Milo', photoPath: 'milo.jpg' },
      { id: 'luna', name: 'Luna', photoPath: null },
    ])

    expect(chips()).toEqual([
      { id: 'milo', name: 'Milo', photoUrl: null },
      { id: 'luna', name: 'Luna', photoUrl: null },
    ])

    await flushPromises()

    expect(chips()).toEqual([
      { id: 'milo', name: 'Milo', photoUrl: 'url:milo.jpg' },
      { id: 'luna', name: 'Luna', photoUrl: null },
    ])
  })

  it('suit la liste quand un animal arrive avec sa photo', async () => {
    const { animals, chips } = mountWith([{ id: 'milo', name: 'Milo', photoPath: null }])

    animals.value = [...animals.value, { id: 'luna', name: 'Luna', photoPath: 'luna.jpg' }]
    await flushPromises()

    expect(chips().map(({ id, photoUrl }) => [id, photoUrl])).toEqual([
      ['milo', null],
      ['luna', 'url:luna.jpg'],
    ])
  })
})
