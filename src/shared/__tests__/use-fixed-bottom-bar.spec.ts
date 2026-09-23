import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { fixedBottomBarHeight, useFixedBottomBar } from '../composables/use-fixed-bottom-bar'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element | null = null
  disconnected = false

  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this)
  }

  observe(target: Element) {
    this.observed = target
  }

  disconnect() {
    this.disconnected = true
  }
}

const Barre = defineComponent({
  props: { hauteur: { type: Number, required: true } },
  setup(props) {
    const bar = shallowRef<HTMLElement | null>(null)
    useFixedBottomBar(bar)
    return () => h('footer', { ref: bar, 'data-hauteur': props.hauteur })
  },
})

async function mesurer() {
  await nextTick()
  for (const observer of FakeResizeObserver.instances) {
    const element = observer.observed as HTMLElement
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      height: Number(element.dataset.hauteur),
    } as DOMRect)
    observer.callback()
  }
  await nextTick()
}

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useFixedBottomBar', () => {
  it('vaut 0 sans barre fixe du bas', () => {
    expect(fixedBottomBarHeight.value).toBe(0)
  })

  it('publie la hauteur mesurée de la barre, arrondie au pixel supérieur', async () => {
    const wrapper = mount(Barre, { props: { hauteur: 145.4 } })
    await mesurer()

    expect(fixedBottomBarHeight.value).toBe(146)
    wrapper.unmount()
  })

  it('garde la plus haute quand deux barres coexistent', async () => {
    const haute = mount(Barre, { props: { hauteur: 146 } })
    const basse = mount(Barre, { props: { hauteur: 60 } })
    await mesurer()

    expect(fixedBottomBarHeight.value).toBe(146)
    haute.unmount()
    expect(fixedBottomBarHeight.value).toBe(60)
    basse.unmount()
  })

  it('libère la place et cesse d’observer quand la barre disparaît', async () => {
    const wrapper = mount(Barre, { props: { hauteur: 80 } })
    await mesurer()

    wrapper.unmount()

    expect(fixedBottomBarHeight.value).toBe(0)
    expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true)
  })
})
