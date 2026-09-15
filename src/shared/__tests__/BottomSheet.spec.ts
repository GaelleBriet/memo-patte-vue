import { App, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import BottomSheet from '../BottomSheet.vue'
import { installBackButton } from '@/core/app-lifecycle/back-button'
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

beforeEach(() => {
  // jsdom ne fournit pas `visualViewport`, que VDialog écoute pour suivre le clavier.
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
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

type Props = InstanceType<typeof BottomSheet>['$props']

async function monter(props: Partial<Props> = {}) {
  wrapper = mount(BottomSheet, {
    props: {
      modelValue: true,
      title: 'Pour quel animal ?',
      closeLabel: 'Fermer',
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
      ...props,
    },
    slots: { default: '<p class="contenu">Contenu</p>' },
    attrs: { class: 'ma-feuille' },
    global: { plugins: [vuetify], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

// Écran hôte : un bouton ouvre la feuille, comme une tuile ou « Ajouter une pesée ».
const Ecran = defineComponent({
  props: { avecRepere: { type: Boolean, default: false } },
  setup(props, { expose }) {
    const open = ref(false)
    const openerVisible = ref(true)
    const repere = ref<HTMLElement | null>(null)
    expose({ open, openerVisible })
    return () =>
      h('div', [
        openerVisible.value
          ? h('button', { class: 'ouvrir', onClick: () => (open.value = true) }, 'Ouvrir')
          : null,
        h('button', { class: 'repere', ref: repere }, 'Repère'),
        h(
          BottomSheet,
          {
            modelValue: open.value,
            'onUpdate:modelValue': (value: boolean) => (open.value = value),
            title: 'Ajouter une pesée',
            closeLabel: 'Fermer',
            focusFallback: props.avecRepere ? repere.value : null,
          },
          () => h('button', { class: 'dans-la-feuille' }, 'Choix'),
        ),
      ])
  },
})

type EcranExpose = { open: boolean; openerVisible: boolean }

async function monterEcran(avecRepere = false) {
  wrapper = mount(Ecran, {
    props: { avecRepere },
    global: { plugins: [vuetify], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

// jsdom ne donne pas le focus au clic : on le pose comme le ferait le tap.
async function ouvrirDepuis(bouton: HTMLElement) {
  bouton.focus()
  bouton.click()
  await flushPromises()
  document.body.querySelector<HTMLElement>('.dans-la-feuille')?.focus()
}

function element(selecteur: string): HTMLElement {
  const trouve = document.body.querySelector<HTMLElement>(selecteur)
  if (!trouve) throw new Error(`${selecteur} absent du document`)
  return trouve
}

function dialogue(): HTMLElement {
  return element('.bottom-sheet[role="dialog"]')
}

describe('BottomSheet — nom accessible', () => {
  it('nomme le dialogue par son titre h2', async () => {
    await monter()

    const id = dialogue().getAttribute('aria-labelledby')
    expect(id).toBeTruthy()
    const titre = document.getElementById(id!)
    expect(titre?.tagName).toBe('H2')
    expect(titre?.textContent?.trim()).toBe('Pour quel animal ?')
  })

  it('donne un id distinct à chaque feuille', async () => {
    const feuille = (title: string) =>
      h(BottomSheet, { modelValue: true, title, closeLabel: 'Fermer' }, () => null)
    wrapper = mount(
      defineComponent(() => () => h('div', [feuille('Première'), feuille('Seconde')])),
      { global: { plugins: [vuetify], stubs: { transition: false } }, attachTo: document.body },
    )
    await flushPromises()

    const ids = [...document.body.querySelectorAll('[role="dialog"]')].map((d) =>
      d.getAttribute('aria-labelledby'),
    )
    expect(ids.map((id) => document.getElementById(id!)?.textContent)).toEqual([
      'Première',
      'Seconde',
    ])
  })
})

describe('BottomSheet — patron', () => {
  it('n’ajoute pas de repère banner à la page', async () => {
    await monter({ subtitle: 'Pour Milo', showClose: true })

    expect(dialogue().querySelector('header, [role="banner"]')).toBeNull()
  })

  it('garde la classe de l’appelant, pose le contenu et la poignée libellée', async () => {
    await monter()

    expect(dialogue().classList).toContain('ma-feuille')
    expect(element('.bottom-sheet__panel .contenu').textContent).toBe('Contenu')
    expect(element('.bottom-sheet__handle').getAttribute('aria-label')).toBe('Fermer')
  })

  it('n’affiche ni sous-titre ni croix par défaut', async () => {
    await monter()

    expect(document.body.querySelector('.bottom-sheet__subtitle')).toBeNull()
    expect(document.body.querySelector('.bottom-sheet__close')).toBeNull()
  })

  it('affiche le sous-titre et la croix libellée sur demande', async () => {
    await monter({ subtitle: 'Pour Milo', showClose: true })

    expect(element('.bottom-sheet__subtitle').textContent?.trim()).toBe('Pour Milo')
    expect(element('.bottom-sheet__close').getAttribute('aria-label')).toBe('Fermer')
  })

  it('se ferme par la poignée et par la croix', async () => {
    const feuille = await monter({ showClose: true })

    element('.bottom-sheet__handle').click()
    await flushPromises()
    await feuille.setProps({ modelValue: true })
    await flushPromises()
    element('.bottom-sheet__close').click()
    await flushPromises()

    expect(feuille.emitted('update:modelValue')).toEqual([[false], [false]])
  })
})

describe('BottomSheet — ordre de lecture', () => {
  it('fait lire le titre et le contenu avant la poignée, dessinée en haut', async () => {
    await monter()

    const lus = [...element('.bottom-sheet__panel').children].map((enfant) => enfant.className)
    expect(lus.indexOf('bottom-sheet__header')).toBeLessThan(lus.indexOf('contenu'))
    expect(lus.at(-1)).toBe('bottom-sheet__handle')
  })

  it('n’annonce pas deux « Fermer » quand la croix est affichée', async () => {
    await monter({ showClose: true })

    const poignee = element('.bottom-sheet__handle')
    expect(poignee.getAttribute('aria-hidden')).toBe('true')
    expect(poignee.getAttribute('tabindex')).toBe('-1')
  })

  it('garde la poignée annoncée quand elle est le seul moyen de fermer', async () => {
    await monter()

    const poignee = element('.bottom-sheet__handle')
    expect(poignee.getAttribute('aria-hidden')).toBeNull()
    expect(poignee.getAttribute('tabindex')).toBeNull()
  })
})

describe('BottomSheet — retour du focus', () => {
  it('rend le focus au déclencheur d’une feuille montée déjà ouverte', async () => {
    const declencheur = document.createElement('button')
    document.body.append(declencheur)
    declencheur.focus()
    const feuille = await monter()
    element('.bottom-sheet__handle').focus()

    await feuille.setProps({ modelValue: false })
    await flushPromises()

    expect(document.activeElement).toBe(declencheur)
  })

  it('rend le focus au bouton qui l’a ouverte, après la poignée', async () => {
    await monterEcran()
    const ouvrir = element('.ouvrir')
    await ouvrirDepuis(ouvrir)

    element('.bottom-sheet__handle').click()
    await flushPromises()

    expect(document.activeElement).toBe(ouvrir)
  })

  it('rend le focus sans faire défiler l’écran', async () => {
    await monterEcran()
    const ouvrir = element('.ouvrir')
    await ouvrirDepuis(ouvrir)
    const focus = vi.spyOn(ouvrir, 'focus')

    element('.bottom-sheet__handle').click()
    await flushPromises()

    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
  })

  it('rend le focus après Échap', async () => {
    await monterEcran()
    const ouvrir = element('.ouvrir')
    await ouvrirDepuis(ouvrir)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(document.activeElement).toBe(ouvrir)
  })

  it('rend le focus après un tap sur le voile', async () => {
    await monterEcran()
    const ouvrir = element('.ouvrir')
    await ouvrirDepuis(ouvrir)

    // Vuetify ferme sur « mousedown puis click » hors du contenu, traité au tick suivant.
    const voile = element('.bottom-sheet .v-overlay__scrim')
    voile.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    voile.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flushPromises()

    expect(document.activeElement).toBe(ouvrir)
  })

  it('rend le focus quand l’appelant la ferme, après un enregistrement ou un choix', async () => {
    const ecran = await monterEcran()
    const ouvrir = element('.ouvrir')
    await ouvrirDepuis(ouvrir)

    ;(ecran.vm as unknown as EcranExpose).open = false
    await flushPromises()

    expect(document.activeElement).toBe(ouvrir)
  })

  it('se replie sur le repère de l’écran quand le bouton d’ouverture a disparu', async () => {
    const ecran = await monterEcran(true)
    await ouvrirDepuis(element('.ouvrir'))

    const vm = ecran.vm as unknown as EcranExpose
    vm.openerVisible = false
    vm.open = false
    await flushPromises()

    expect(document.activeElement).toBe(element('.repere'))
  })

  it('ne pose le focus nulle part sans bouton d’ouverture ni repère', async () => {
    const ecran = await monterEcran()
    await ouvrirDepuis(element('.ouvrir'))

    const vm = ecran.vm as unknown as EcranExpose
    vm.openerVisible = false
    vm.open = false
    await flushPromises()

    expect(document.activeElement).not.toBe(element('.repere'))
  })
})

describe('BottomSheet — bouton retour Android', () => {
  let desinstaller: () => void

  beforeEach(() => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    ;(App.addListener as unknown as Mock).mockClear()
    desinstaller = installBackButton()
  })

  afterEach(() => desinstaller())

  function retour(): void {
    const appel = (App.addListener as unknown as Mock).mock.calls.at(-1)
    if (!appel) throw new Error('écouteur backButton absent')
    ;(appel[1] as BackListener)({ canGoBack: true })
  }

  it('ferme la feuille ouverte sans quitter l’écran et rend le focus au déclencheur', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const ecran = await monterEcran()
    const ouvrir = element('.ouvrir')
    await ouvrirDepuis(ouvrir)

    retour()
    await flushPromises()

    expect((ecran.vm as unknown as EcranExpose).open).toBe(false)
    expect(back).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(ouvrir)
  })

  it('reste ouverte et ne navigue pas pendant une opération en cours', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const feuille = await monter({ persistent: true })

    retour()
    await flushPromises()

    expect(feuille.emitted('update:modelValue')).toBeUndefined()
    expect(back).not.toHaveBeenCalled()
  })

  it('laisse le retour à l’écran précédent une fois la feuille fermée', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const feuille = await monter()

    await feuille.setProps({ modelValue: false })
    await flushPromises()
    retour()

    expect(back).toHaveBeenCalledOnce()
  })

  it('laisse le retour à l’écran précédent quand la feuille ouverte est démontée', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const feuille = await monter()

    feuille.unmount()
    wrapper = null
    retour()

    expect(back).toHaveBeenCalledOnce()
  })

  it('ferme d’abord la dernière feuille ouverte', async () => {
    const premiere = ref(true)
    const seconde = ref(false)
    const feuille = (title: string, open: typeof premiere) =>
      h(
        BottomSheet,
        {
          modelValue: open.value,
          'onUpdate:modelValue': (value: boolean) => (open.value = value),
          title,
          closeLabel: 'Fermer',
        },
        () => null,
      )
    wrapper = mount(
      defineComponent(
        () => () => h('div', [feuille('Seconde', seconde), feuille('Première', premiere)]),
      ),
      { global: { plugins: [vuetify], stubs: { transition: false } }, attachTo: document.body },
    )
    await flushPromises()
    seconde.value = true
    await flushPromises()

    retour()
    await flushPromises()
    expect([premiere.value, seconde.value]).toEqual([true, false])

    retour()
    await flushPromises()
    expect(premiere.value).toBe(false)
  })
})
