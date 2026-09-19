import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PushedScreen from '../components/PushedScreen.vue'
import vuetify from '@/core/theme/vuetify'

type Props = InstanceType<typeof PushedScreen>['$props']

function monter(
  props: Partial<Props> = {},
  slots: Record<string, string> = { default: '<p class="contenu">Contenu</p>' },
) {
  return mount(PushedScreen, {
    props: { title: 'Suivi de poids', backLabel: 'Retour', ...props },
    slots,
    attrs: { class: 'weight-history' },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('PushedScreen — top bar', () => {
  it('affiche le titre, la flèche de retour libellée et le contenu dans la zone défilante', () => {
    const wrapper = monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Suivi de poids')
    expect(wrapper.get('.pushed-screen__back').attributes('aria-label')).toBe('Retour')
    expect(wrapper.get('.pushed-screen__scroll .contenu').text()).toBe('Contenu')
    expect(wrapper.find('.pushed-screen__subtitle').exists()).toBe(false)
  })

  it('émet back depuis la flèche', async () => {
    const wrapper = monter()

    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('affiche le sous-titre et resserre alors l’interligne du titre', () => {
    const sans = monter()
    const avec = monter({ subtitle: 'Milo' })

    expect(avec.get('.pushed-screen__subtitle').text()).toBe('Milo')
    expect(sans.get('.pushed-screen__topbar').classes()).not.toContain(
      'pushed-screen__topbar--with-subtitle',
    )
    expect(avec.get('.pushed-screen__topbar').classes()).toContain(
      'pushed-screen__topbar--with-subtitle',
    )
  })

  it('écrit le sous-titre en hint par défaut, en texte secondaire sur demande', () => {
    expect(
      monter({ subtitle: 'Pour Milo' }).get('.pushed-screen__subtitle').classes(),
    ).not.toContain('pushed-screen__subtitle--secondary')
    expect(
      monter({ subtitle: 'Milo', subtitleTone: 'secondary' })
        .get('.pushed-screen__subtitle')
        .classes(),
    ).toContain('pushed-screen__subtitle--secondary')
  })

  it('garde la classe passée par l’écran sur sa racine', () => {
    const wrapper = monter()

    expect(wrapper.classes()).toContain('pushed-screen')
    expect(wrapper.classes()).toContain('weight-history')
  })

  it('pose la bordure de la top bar dès que le contenu défile', async () => {
    const wrapper = monter()
    const zone = wrapper.get('.pushed-screen__scroll')

    expect(wrapper.get('.pushed-screen__topbar').classes()).not.toContain(
      'pushed-screen__topbar--scrolled',
    )

    Object.defineProperty(zone.element, 'scrollTop', { value: 12, configurable: true })
    await zone.trigger('scroll')

    expect(wrapper.get('.pushed-screen__topbar').classes()).toContain(
      'pushed-screen__topbar--scrolled',
    )
  })
})

describe('PushedScreen — barre du bas', () => {
  it('rend le slot actions dans une barre hors de la zone défilante', () => {
    const wrapper = monter({}, { default: '<p>Contenu</p>', actions: '<button>Ajouter</button>' })

    const barre = wrapper.get('.pushed-screen__actions')
    expect(barre.text()).toBe('Ajouter')
    expect(wrapper.find('.pushed-screen__scroll .pushed-screen__actions').exists()).toBe(false)
  })

  it('n’affiche aucune barre sans slot actions', () => {
    expect(monter().find('.pushed-screen__actions').exists()).toBe(false)
  })
})

describe('PushedScreen — champ ramené en vue', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('réserve sous la top bar sa hauteur mesurée, pour qu’un champ focalisé ne passe pas dessous', async () => {
    let signaler: () => void = () => {}
    let observee: Element | null = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(rappel: () => void) {
          signaler = rappel
        }
        observe(cible: Element) {
          observee = cible
        }
        disconnect() {}
      },
    )
    const wrapper = monter()
    const topbar = wrapper.get('.pushed-screen__topbar').element

    expect(observee).toBe(topbar)
    vi.spyOn(topbar, 'getBoundingClientRect').mockReturnValue({ height: 75.4 } as DOMRect)
    signaler()
    await wrapper.vm.$nextTick()

    expect(
      (wrapper.get('.pushed-screen__scroll').element as HTMLElement).style.getPropertyValue(
        '--pushed-screen-topbar-height',
      ),
    ).toBe('76px')
  })
})
