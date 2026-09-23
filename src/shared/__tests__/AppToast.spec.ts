import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { VSnackbar } from 'vuetify/components'

import AppToast from '../components/AppToast.vue'
import { dismissToast, showToast, toastMessage } from '../utils/toast'
import { heightBottomNav, paddingBottomNav } from '@/core/theme/layout-tokens'
import vuetify from '@/core/theme/vuetify'

function mountToast() {
  return mount(AppToast, { global: { plugins: [vuetify] }, attachTo: document.body })
}

// `offset` n'est pas déclarée par `VSnackbar`, qui la relaie à son overlay : elle passe par `$attrs`.
function offsetDuToast(aboveBottomNav: boolean): unknown {
  const wrapper = mount(AppToast, { props: { aboveBottomNav }, global: { plugins: [vuetify] } })
  const offset = wrapper.getComponent(VSnackbar).vm.$attrs.offset
  wrapper.unmount()

  return offset
}

beforeEach(() => {
  // jsdom ne fournit pas `visualViewport`, que l'overlay de VSnackbar écoute.
  vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
  dismissToast()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('AppToast', () => {
  it('reste invisible tant qu’aucun message n’est envoyé', () => {
    const wrapper = mountToast()

    expect(document.body.querySelector('.app-toast')).toBeNull()
    wrapper.unmount()
  })

  it('affiche le message envoyé par showToast dans une région annoncée', async () => {
    const wrapper = mountToast()

    showToast('Rappels activés')
    await nextTick()

    const toast = document.body.querySelector('.app-toast')
    expect(toast?.textContent).toContain('Rappels activés')
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Rappels activés')
    wrapper.unmount()
  })

  it('se referme seul après quelques secondes', async () => {
    vi.useFakeTimers()
    const wrapper = mountToast()
    showToast('Rappels activés')
    await nextTick()

    vi.advanceTimersByTime(4000)
    await nextTick()

    expect(toastMessage.value).toBeNull()
    wrapper.unmount()
  })

  it('reste affiché plus longtemps quand le message le demande, puis revient à la durée courante', async () => {
    vi.useFakeTimers()
    const wrapper = mountToast()
    showToast('Export JSON enregistré dans Documents › MémoPatte', { durationMs: 4000 })
    await nextTick()

    vi.advanceTimersByTime(3500)
    await nextTick()
    expect(toastMessage.value).toBe('Export JSON enregistré dans Documents › MémoPatte')

    vi.advanceTimersByTime(600)
    await nextTick()
    expect(toastMessage.value).toBeNull()

    showToast('Rappels activés')
    await nextTick()
    vi.advanceTimersByTime(3100)
    await nextTick()
    expect(toastMessage.value).toBeNull()
    wrapper.unmount()
  })

  it('garde sa région annoncée en place avant le message, pour que TalkBack le lise', async () => {
    const wrapper = mountToast()
    const region = document.body.querySelector('[role="status"]')
    expect(region?.getAttribute('aria-live')).toBe('polite')

    showToast('Pesée enregistrée')
    await nextTick()

    expect(region?.textContent).toContain('Pesée enregistrée')
    const annoncees = [...document.body.querySelectorAll('[role="status"]')].filter(
      (element) => !element.closest('[aria-hidden="true"]'),
    )
    expect(annoncees).toEqual([region])
    wrapper.unmount()
  })

  it('se pose au-dessus de la bottom navigation quand elle est là', () => {
    expect(offsetDuToast(true)).toBe(heightBottomNav + paddingBottomNav + 12)
  })

  it('ne garde que la zone de gestes sous lui sur un écran sans bottom navigation', () => {
    expect(offsetDuToast(false)).toBe(paddingBottomNav + 12)
  })
})
