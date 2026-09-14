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

describe('FormScreen — écran poussé', () => {
  it('s’appuie sur PushedScreen : titre, flèche « Retour » et champs dans la zone défilante', () => {
    const wrapper = monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Nouvel animal')
    expect(wrapper.get('.pushed-screen__back').attributes('aria-label')).toBe('Retour')
    expect(wrapper.get('.pushed-screen__scroll .form-screen__fields .contenu').text()).toBe(
      'Champs',
    )
    expect(wrapper.find('.pushed-screen__subtitle').exists()).toBe(false)
  })

  it('transmet le sous-titre, dans le ton hint', () => {
    const sousTitre = monter({ subtitle: 'Pour Milo' }).get('.pushed-screen__subtitle')

    expect(sousTitre.text()).toBe('Pour Milo')
    expect(sousTitre.classes()).not.toContain('pushed-screen__subtitle--secondary')
  })

  it('garde la classe passée par l’écran sur sa racine', () => {
    const wrapper = monter()

    expect(wrapper.classes()).toContain('pushed-screen')
    expect(wrapper.classes()).toContain('form-screen')
    expect(wrapper.classes()).toContain('animal-form')
  })

  it('place les boutons dans la barre du bas, hors de la zone défilante', () => {
    const wrapper = monter()

    expect(wrapper.find('.pushed-screen__actions .form-screen__submit').exists()).toBe(true)
    expect(wrapper.find('.pushed-screen__scroll .form-screen__submit').exists()).toBe(false)
  })
})

describe('FormScreen — actions', () => {
  it('émet cancel depuis la flèche et depuis « Annuler »', async () => {
    const wrapper = monter()

    await wrapper.get('.pushed-screen__back').trigger('click')
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
