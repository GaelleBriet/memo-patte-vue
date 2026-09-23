import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { useChartMeasure } from '../composables/use-chart-measure'

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

const Mesure = defineComponent({
  props: { fontSize: { type: String, default: undefined } },
  setup(props) {
    const target = shallowRef<Element | null>(null)
    const { width, textScale } = useChartMeasure(target, 320)
    return () =>
      h('div', { ref: target }, [
        h('span', `${width.value}|${textScale.value}`),
        props.fontSize === undefined
          ? null
          : h('svg', [h('text', { style: `font-size: ${props.fontSize}` }, 'Mai')]),
      ])
  },
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

async function monter(fontSize?: string) {
  const wrapper = mount(Mesure, { props: { fontSize } })
  await nextTick()
  return wrapper
}

describe('useChartMeasure — largeur', () => {
  it('garde la largeur initiale tant que l’élément n’est pas mesuré', async () => {
    const wrapper = await monter()

    expect(wrapper.get('span').text()).toBe('320|1')
  })

  it('suit la largeur rendue, arrondie au pixel', async () => {
    const wrapper = await monter()

    await redimensionner(290.4)

    expect(wrapper.get('span').text()).toBe('290|1')
  })

  it('ignore une mesure nulle, celle d’un élément masqué', async () => {
    const wrapper = await monter()
    await redimensionner(300)

    await redimensionner(0)

    expect(wrapper.get('span').text()).toBe('300|1')
  })

  it('cesse d’observer l’élément au démontage', async () => {
    const wrapper = await monter()
    expect(FakeResizeObserver.instances).toHaveLength(1)

    wrapper.unmount()

    expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true)
  })
})

describe('useChartMeasure — police agrandie', () => {
  it('lit l’agrandissement sur la taille de police rendue d’un texte de la courbe', async () => {
    const wrapper = await monter('15.6px')

    await redimensionner(300)

    expect(wrapper.get('span').text()).toBe('300|1.3')
  })

  it('reste à 1 sans texte dans la courbe', async () => {
    const wrapper = await monter()

    await redimensionner(300)

    expect(wrapper.get('span').text()).toBe('300|1')
  })
})
