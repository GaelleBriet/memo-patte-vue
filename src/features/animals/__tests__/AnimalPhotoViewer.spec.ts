import { App, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import AnimalPhotoViewer from '../views/AnimalPhotoViewer.vue'
import { installBackButton } from '@/core/app-lifecycle/back-button'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

type BackListener = (event: BackButtonListenerEvent) => void

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn<(event: string, callback: BackListener) => Promise<PluginListenerHandle>>(
      async () => ({ remove: async () => {} }),
    ),
    minimizeApp: vi.fn<() => Promise<void>>(async () => {}),
  },
}))

let wrapper: VueWrapper | null = null
let uninstall: (() => void) | null = null

beforeEach(() => {
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  uninstall?.()
  uninstall = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(AnimalPhotoViewer, {
    props: {
      modelValue: true,
      src: 'url:milo.jpg',
      name: 'Milo',
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
    },
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function visionneuse(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.animal-photo-viewer__panel')
}

describe('AnimalPhotoViewer', () => {
  it('montre la photo en plein écran, nommée pour les lecteurs d’écran', async () => {
    await monter()

    const photo = visionneuse()!.querySelector('img')!
    expect(photo.getAttribute('src')).toBe('url:milo.jpg')
    expect(photo.getAttribute('alt')).toBe('Photo de Milo')
  })

  it('se ferme par la croix', async () => {
    await monter()

    const croix = visionneuse()!.querySelector<HTMLElement>('.animal-photo-viewer__close')!
    expect(croix.getAttribute('aria-label')).toBe('Fermer')
    croix.click()
    await flushPromises()

    expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('se ferme par le retour Android', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    uninstall = installBackButton()
    const retour = (vi.mocked(App.addListener) as Mock).mock.calls.at(-1)![1] as BackListener
    await monter()

    retour({ canGoBack: true })
    await flushPromises()

    expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
