import { App, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import OverflowMenu from '../components/OverflowMenu.vue'
import { installBackButton, onBackButton } from '@/core/app-lifecycle/back-button'
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

let uninstall: (() => void) | null = null

const ITEMS = [
  { id: 'changeDate', label: 'Changer la date', icon: 'ms:edit_calendar' },
  { id: 'remove', label: 'Supprimer cette injection', icon: 'ms:delete', danger: true },
]

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
  uninstall?.()
  uninstall = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function ouvrir() {
  const wrapper = mount(OverflowMenu, {
    props: { label: 'Options pour l’injection du 27 juillet 2026', items: ITEMS },
    global: { plugins: [vuetify], stubs: { transition: false } },
    attachTo: document.body,
  })
  await wrapper.get('.overflow-menu__button').trigger('click')
  await flushPromises()
  return wrapper
}

function items(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('.overflow-menu__item')]
}

describe('OverflowMenu', () => {
  it('nomme le bouton ⋮ et liste ses actions, la destructive en couleur d’erreur', async () => {
    const wrapper = await ouvrir()

    expect(wrapper.get('.overflow-menu__button').attributes('aria-label')).toBe(
      'Options pour l’injection du 27 juillet 2026',
    )
    expect(items().map((item) => item.textContent?.trim())).toEqual([
      'Changer la date',
      'Supprimer cette injection',
    ])
    expect(items()[1]?.classList).toContain('overflow-menu__item--danger')
    expect(items()[0]?.classList).not.toContain('overflow-menu__item--danger')
    wrapper.unmount()
  })

  it('se ferme au retour Android, avant l’écran qu’il recouvre', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    uninstall = installBackButton()
    const retour = (vi.mocked(App.addListener) as Mock).mock.calls.at(-1)![1] as BackListener
    const ecran = vi.fn<() => void>()
    const libererEcran = onBackButton(ecran)
    const wrapper = await ouvrir()

    retour({ canGoBack: true })
    await flushPromises()

    expect(wrapper.get('.overflow-menu__button').attributes('aria-expanded')).toBe('false')
    expect(ecran).not.toHaveBeenCalled()
    retour({ canGoBack: true })
    expect(ecran).toHaveBeenCalledOnce()
    libererEcran()
    wrapper.unmount()
  })

  it('émet l’action choisie', async () => {
    const wrapper = await ouvrir()

    items()[1]?.click()

    expect(wrapper.emitted('select')).toEqual([['remove']])
    wrapper.unmount()
  })
})
