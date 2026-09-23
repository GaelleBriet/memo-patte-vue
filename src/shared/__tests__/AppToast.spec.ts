import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import AppToast from '../components/AppToast.vue'
import { dismissToast, showToast, toastMessage } from '../utils/toast'
import { getMsIconPath } from '@/core/theme/icons'
import vuetify from '@/core/theme/vuetify'

function mountToast() {
  return mount(AppToast, { global: { plugins: [vuetify] }, attachTo: document.body })
}

function toucher(type: string, liste: 'touches' | 'changedTouches', clientY: number): Event {
  const evenement = new Event(type)
  Object.defineProperty(evenement, liste, { value: [{ clientY }] })
  return evenement
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

  it('précède le message de la coche pleine de la maquette', async () => {
    const wrapper = mountToast()

    showToast('Rappels activés')
    await nextTick()

    const trace = document.body.querySelector('.app-toast__icon svg path')?.getAttribute('d')
    expect(trace).toBeTruthy()
    expect(trace).toBe(getMsIconPath('check_circle_fill')?.path)
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

  it('redonne sa durée complète au toast quand le même message revient', async () => {
    vi.useFakeTimers()
    const wrapper = mountToast()
    const message = 'Export JSON enregistré dans Documents › MémoPatte'
    showToast(message, { durationMs: 4000 })
    await nextTick()

    vi.advanceTimersByTime(3000)
    showToast(message, { durationMs: 4000 })
    await nextTick()

    vi.advanceTimersByTime(3900)
    await nextTick()
    expect(toastMessage.value).toBe(message)

    vi.advanceTimersByTime(200)
    await nextTick()
    expect(toastMessage.value).toBeNull()
    wrapper.unmount()
  })

  it('redonne aussi sa durée complète au toast quand un autre message le remplace', async () => {
    vi.useFakeTimers()
    const wrapper = mountToast()
    showToast('Rappels activés')
    await nextTick()

    vi.advanceTimersByTime(2000)
    showToast('Données exportées')
    await nextTick()

    vi.advanceTimersByTime(2900)
    await nextTick()
    expect(toastMessage.value).toBe('Données exportées')

    vi.advanceTimersByTime(200)
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

  it('se ferme d’un glissement vers le bas', async () => {
    const wrapper = mountToast()
    showToast('Rappels activés')
    await nextTick()

    const toast = document.body.querySelector('.app-toast')!
    toast.dispatchEvent(toucher('touchstart', 'touches', 300))
    toast.dispatchEvent(toucher('touchend', 'changedTouches', 400))
    await nextTick()

    expect(toastMessage.value).toBeNull()
    wrapper.unmount()
  })
})
