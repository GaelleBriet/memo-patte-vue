import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import AppToast from '../AppToast.vue'
import { dismissToast, showToast, toastMessage } from '../toast'
import vuetify from '@/core/theme/vuetify'

function mountToast() {
  return mount(AppToast, { global: { plugins: [vuetify] }, attachTo: document.body })
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
})
