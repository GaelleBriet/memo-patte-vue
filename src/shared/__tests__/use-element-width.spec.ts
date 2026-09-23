import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { useElementWidth } from '../composables/use-element-width'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  disconnected = false

  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this)
  }

  observe() {}

  disconnect() {
    this.disconnected = true
  }
}

const Mesure = defineComponent(() => {
  const target = shallowRef<Element | null>(null)
  const width = useElementWidth(target, 320)
  return () => h('div', { ref: target }, String(width.value))
})

let largeurRendue = 0

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: largeurRendue }) as DOMRect,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function redimensionner(largeur: number) {
  largeurRendue = largeur
  FakeResizeObserver.instances.forEach((observer) => observer.callback())
  await nextTick()
}

describe('useElementWidth', () => {
  it('garde la largeur initiale tant que l’élément n’est pas mesuré', async () => {
    const wrapper = mount(Mesure)
    await nextTick()

    expect(wrapper.text()).toBe('320')
  })

  it('suit la largeur rendue, arrondie au pixel', async () => {
    const wrapper = mount(Mesure)
    await nextTick()

    await redimensionner(290.4)

    expect(wrapper.text()).toBe('290')
  })

  it('ignore une mesure nulle, celle d’un élément masqué', async () => {
    const wrapper = mount(Mesure)
    await nextTick()
    await redimensionner(300)

    await redimensionner(0)

    expect(wrapper.text()).toBe('300')
  })

  it('cesse d’observer l’élément au démontage', async () => {
    const wrapper = mount(Mesure)
    await nextTick()
    expect(FakeResizeObserver.instances).toHaveLength(1)

    wrapper.unmount()

    expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true)
  })
})
