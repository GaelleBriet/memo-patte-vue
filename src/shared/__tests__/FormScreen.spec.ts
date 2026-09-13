import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FormScreen from '../form/FormScreen.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

type Props = InstanceType<typeof FormScreen>['$props']

function monter(props: Partial<Props> = {}, slot = '<p class="contenu">Champs</p>') {
  return mount(FormScreen, {
    props: { title: 'Nouvel animal', submitLabel: 'Créer', ...props },
    slots: { default: slot },
    attrs: { class: 'animal-form' },
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
}

describe('FormScreen — top bar', () => {
  it('affiche le titre, la flèche « Retour » et rend le slot dans la zone des champs', () => {
    const wrapper = monter()

    expect(wrapper.get('.form-screen__title').text()).toBe('Nouvel animal')
    expect(wrapper.get('.form-screen__back').attributes('aria-label')).toBe('Retour')
    expect(wrapper.get('.form-screen__fields .contenu').text()).toBe('Champs')
    expect(wrapper.find('.form-screen__subtitle').exists()).toBe(false)
  })

  it('affiche le sous-titre quand il est fourni', () => {
    const wrapper = monter({ subtitle: 'Pour Milo' })

    expect(wrapper.get('.form-screen__subtitle').text()).toBe('Pour Milo')
  })

  it('ne resserre l’interligne du titre que lorsqu’un sous-titre l’accompagne', () => {
    expect(monter().get('.form-screen__heading').classes()).not.toContain(
      'form-screen__heading--with-subtitle',
    )
    expect(monter({ subtitle: 'Pour Milo' }).get('.form-screen__heading').classes()).toContain(
      'form-screen__heading--with-subtitle',
    )
  })

  it('garde la classe passée par l’écran sur sa racine', () => {
    const wrapper = monter()

    expect(wrapper.classes()).toContain('form-screen')
    expect(wrapper.classes()).toContain('animal-form')
  })

  it('pose la bordure de la top bar dès que le contenu défile', async () => {
    const wrapper = monter()
    const zone = wrapper.get('.form-screen__scroll')

    expect(wrapper.get('.form-screen__topbar').classes()).not.toContain(
      'form-screen__topbar--scrolled',
    )

    Object.defineProperty(zone.element, 'scrollTop', { value: 12, configurable: true })
    await zone.trigger('scroll')

    expect(wrapper.get('.form-screen__topbar').classes()).toContain('form-screen__topbar--scrolled')
  })
})

describe('FormScreen — actions', () => {
  it('émet cancel depuis la flèche et depuis « Annuler »', async () => {
    const wrapper = monter()

    await wrapper.get('.form-screen__back').trigger('click')
    await wrapper.get('.form-screen__cancel').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(2)
    expect(wrapper.get('.form-screen__cancel').text()).toBe('Annuler')
  })

  it('émet submit depuis le bouton principal, avec le libellé reçu', async () => {
    const wrapper = monter()

    await wrapper.get('.form-screen__submit').trigger('click')

    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.get('.form-screen__submit').text()).toBe('Créer')
  })

  it('désactive les deux boutons et montre le spinner pendant l’envoi', () => {
    const wrapper = monter({ isSubmitting: true, submitLabel: 'Création…' })

    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__cancel').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.form-screen__spinner').exists()).toBe(true)
    expect(wrapper.get('.form-screen__submit').text()).toBe('Création…')
  })

  it('ne désactive que l’envoi quand l’écran est verrouillé', () => {
    const wrapper = monter({ disabled: true })

    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__cancel').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.form-screen__spinner').exists()).toBe(false)
  })

  it('affiche le message d’erreur global au-dessus des boutons, en alerte', () => {
    const wrapper = monter({ errorMessage: 'Cet animal est introuvable.' })

    const erreur = wrapper.get('.form-screen__save-error')
    expect(erreur.text()).toBe('Cet animal est introuvable.')
    expect(erreur.attributes('role')).toBe('alert')
  })

  it('n’affiche rien sans message d’erreur', () => {
    const wrapper = monter()

    expect(wrapper.find('.form-screen__save-error').exists()).toBe(false)
  })
})
