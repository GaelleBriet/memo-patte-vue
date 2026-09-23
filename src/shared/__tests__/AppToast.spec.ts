import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import AppToast from '../components/AppToast.vue'
import PushedScreen from '../components/PushedScreen.vue'
import { dismissToast, showToast, toastMessage } from '../utils/toast'
import { getMsIconPath } from '@/core/theme/icons'
import vuetify from '@/core/theme/vuetify'

const ANNONCE_MS = 100

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
    vi.useFakeTimers()
    const wrapper = mountToast()

    showToast('Rappels activés')
    await nextTick()
    vi.advanceTimersByTime(ANNONCE_MS)
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

  it.each([
    [undefined, 'success', 'check_circle_fill'],
    ['info', 'info', 'info_fill'],
    ['error', 'error', 'error_fill'],
  ] as const)(
    'prend la tonalité demandée (%s) : sa couleur et son icône',
    async (tone, classe, icone) => {
      const wrapper = mountToast()

      showToast('La restauration n’a pas abouti. Réessaie.', tone ? { tone } : {})
      await nextTick()

      const toast = document.body.querySelector('.app-toast')
      expect(toast?.classList.contains(`app-toast--${classe}`)).toBe(true)
      const trace = toast?.querySelector('.app-toast__icon svg path')?.getAttribute('d')
      expect(trace).toBeTruthy()
      expect(trace).toBe(getMsIconPath(icone)?.path)
      wrapper.unmount()
    },
  )

  it('revient à la tonalité de réussite quand un appel ne la précise pas', async () => {
    const wrapper = mountToast()
    showToast('La restauration n’a pas abouti. Réessaie.', { tone: 'error' })
    await nextTick()

    showToast('Rappels activés')
    await nextTick()

    expect(document.body.querySelector('.app-toast')?.classList).toContain('app-toast--success')
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
    vi.useFakeTimers()
    const wrapper = mountToast()
    const region = document.body.querySelector('[role="status"]')
    expect(region?.getAttribute('aria-live')).toBe('polite')

    showToast('Pesée enregistrée')
    await nextTick()
    vi.advanceTimersByTime(ANNONCE_MS)
    await nextTick()

    expect(region?.textContent).toContain('Pesée enregistrée')
    const annoncees = [...document.body.querySelectorAll('[role="status"]')].filter(
      (element) => !element.closest('[aria-hidden="true"]'),
    )
    expect(annoncees).toEqual([region])
    wrapper.unmount()
  })

  it('annonce de nouveau le même message quand il revient', async () => {
    vi.useFakeTimers()
    const wrapper = mountToast()
    const region = document.body.querySelector('[role="status"]')
    const message = 'Export JSON enregistré dans Documents › MémoPatte'
    showToast(message)
    await nextTick()
    vi.advanceTimersByTime(ANNONCE_MS)
    await nextTick()

    const textes: string[] = []
    const observateur = new MutationObserver(() => textes.push(region?.textContent ?? ''))
    observateur.observe(region!, { childList: true, characterData: true, subtree: true })
    showToast(message)
    await nextTick()
    vi.advanceTimersByTime(ANNONCE_MS)
    await nextTick()
    await Promise.resolve()
    observateur.disconnect()

    expect(textes).toEqual(['', message])
    wrapper.unmount()
  })

  it('se pose au-dessus de la barre d’actions fixe d’un écran poussé', async () => {
    let mesurer: () => void = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(rappel: () => void) {
          mesurer = rappel
        }
        observe(cible: Element) {
          if (!cible.classList.contains('pushed-screen__actions')) return
          vi.spyOn(cible, 'getBoundingClientRect').mockReturnValue({ height: 146 } as DOMRect)
        }
        disconnect() {}
      },
    )
    const ecran = mount(PushedScreen, {
      props: { title: 'MémoPatte Plus', backLabel: 'Retour' },
      slots: { default: '<p>Offres</p>', actions: '<button>Continuer</button>' },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    const wrapper = mountToast()
    await nextTick()
    mesurer()

    showToast('Aucun achat à restaurer sur ce compte Google.')
    await nextTick()

    const toast = document.body.querySelector<HTMLElement>('.app-toast')
    expect(toast?.style.getPropertyValue('--fixed-bottom-bar-height')).toBe('146px')
    wrapper.unmount()
    ecran.unmount()
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
