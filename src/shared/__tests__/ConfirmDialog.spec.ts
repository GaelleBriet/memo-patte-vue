import { App, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import ConfirmDialog from '../components/ConfirmDialog.vue'
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

type Props = InstanceType<typeof ConfirmDialog>['$props']

async function monter(props: Partial<Props> = {}) {
  wrapper = mount(ConfirmDialog, {
    props: {
      modelValue: true,
      title: 'Arrêter Bravecto ?',
      text: 'Plus aucun rappel pour ce traitement.',
      cancelLabel: 'Annuler',
      confirmLabel: 'Arrêter',
      cancelAriaLabel: 'Annuler, garder Bravecto',
      confirmAriaLabel: 'Arrêter le traitement Bravecto',
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
      ...props,
    },
    global: { plugins: [vuetify], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function bouton(classe: string): HTMLButtonElement {
  return document.body.querySelector<HTMLButtonElement>(`.confirm-dialog__${classe}`)!
}

function installerRetour(): BackListener {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
  uninstall = installBackButton()
  return (vi.mocked(App.addListener) as Mock).mock.calls.at(-1)![1] as BackListener
}

describe('ConfirmDialog', () => {
  it('affiche le titre, le texte et les deux actions, « Annuler » avant l’action à droite', async () => {
    await monter()

    expect(document.body.querySelector('.confirm-dialog__title')?.textContent).toBe(
      'Arrêter Bravecto ?',
    )
    expect(document.body.querySelector('.confirm-dialog__text')?.textContent).toBe(
      'Plus aucun rappel pour ce traitement.',
    )
    const actions = [...document.body.querySelectorAll('.confirm-dialog__actions .v-btn')]
    expect(actions.map((action) => action.textContent?.trim())).toEqual(['Annuler', 'Arrêter'])
    expect(bouton('cancel').getAttribute('aria-label')).toBe('Annuler, garder Bravecto')
    expect(bouton('confirm').getAttribute('aria-label')).toBe('Arrêter le traitement Bravecto')
  })

  it('peint une action destructive dans la couleur système d’erreur, une action principale en pétrole', async () => {
    await monter()
    expect(bouton('confirm').classList).toContain('text-error')

    await wrapper!.setProps({ tone: 'primary' })
    expect(bouton('confirm').classList).toContain('bg-primary')
  })

  it('donne le focus initial à « Annuler »', async () => {
    await monter({ modelValue: false })

    await wrapper!.setProps({ modelValue: true })
    await vi.waitFor(() => expect(document.activeElement).toBe(bouton('cancel')))
  })

  it('rend le focus au bouton qui l’a ouvert quand on annule', async () => {
    const declencheur = document.createElement('button')
    document.body.append(declencheur)
    declencheur.focus()
    await monter({ modelValue: false })
    await wrapper!.setProps({ modelValue: true })
    await vi.waitFor(() => expect(document.activeElement).toBe(bouton('cancel')))

    bouton('cancel').click()

    await vi.waitFor(() => expect(document.activeElement).toBe(declencheur))
  })

  it('confirme en fermant le dialogue', async () => {
    await monter()

    bouton('confirm').click()
    await flushPromises()

    expect(wrapper!.emitted('confirm')).toHaveLength(1)
    expect(wrapper!.emitted('cancel')).toBeUndefined()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
  })

  it('annule en fermant le dialogue', async () => {
    await monter()

    bouton('cancel').click()
    await flushPromises()

    expect(wrapper!.emitted('cancel')).toHaveLength(1)
    expect(wrapper!.emitted('confirm')).toBeUndefined()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
  })

  it('se ferme au retour Android sans rien confirmer, avant la feuille qu’il recouvre', async () => {
    const retour = installerRetour()
    const feuille = vi.fn<() => void>()
    const libererFeuille = onBackButton(feuille)
    await monter()

    retour({ canGoBack: true })
    await flushPromises()

    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper!.emitted('confirm')).toBeUndefined()
    expect(wrapper!.emitted('cancel')).toBeUndefined()
    expect(feuille).not.toHaveBeenCalled()

    retour({ canGoBack: true })
    expect(feuille).toHaveBeenCalledOnce()
    libererFeuille()
  })
})
