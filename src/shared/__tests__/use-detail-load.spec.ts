import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useDetailLoad } from '../composables/use-detail-load'

function monter(load: (id: string) => Promise<string | null>) {
  const id = ref('a')
  let exposed!: ReturnType<typeof useDetailLoad<string>>
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = useDetailLoad(() => id.value, load)
        return () => h('div')
      },
    }),
  )
  return { id, wrapper, detail: () => exposed }
}

describe('useDetailLoad', () => {
  it('charge l’élément puis le relit quand l’identifiant change', async () => {
    const load = vi.fn(async (id: string) => `élément ${id}`)
    const { id, detail } = monter(load)

    expect(detail().state.value).toBe('loading')
    await flushPromises()
    expect(detail().data.value).toBe('élément a')
    expect(detail().state.value).toBe('ready')

    id.value = 'b'
    await flushPromises()
    expect(detail().data.value).toBe('élément b')
  })

  it('dit « introuvable » quand le chargement rend null', async () => {
    const { detail } = monter(async () => null)
    await flushPromises()

    expect(detail().state.value).toBe('not-found')
  })

  it('dit l’échec d’un premier chargement, garde les données d’un chargement réussi', async () => {
    const load = vi.fn<(id: string) => Promise<string | null>>()
    load.mockRejectedValueOnce(new Error('base indisponible'))
    const { detail } = monter(load)
    await flushPromises()
    expect(detail().state.value).toBe('error')

    load.mockResolvedValueOnce('élément a')
    await detail().reload()
    load.mockRejectedValueOnce(new Error('base indisponible'))
    await detail().reload()

    expect(detail().state.value).toBe('ready')
    expect(detail().data.value).toBe('élément a')
  })

  it('ignore la réponse d’un identifiant déjà quitté', async () => {
    let finishA: (value: string) => void = () => {}
    const load = vi.fn((id: string) =>
      id === 'a'
        ? new Promise<string>((resolve) => (finishA = resolve))
        : Promise.resolve(`élément ${id}`),
    )
    const { id, detail } = monter(load)

    id.value = 'b'
    await flushPromises()
    finishA('élément a')
    await flushPromises()

    expect(detail().data.value).toBe('élément b')
  })
})
