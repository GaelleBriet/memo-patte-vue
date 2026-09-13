import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FormField from '../form/FormField.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

type Props = InstanceType<typeof FormField>['$props']

function monter(props: Partial<Props> = {}, slot = '<input id="animal-name" />') {
  return mount(FormField, {
    props: { label: 'Nom', ...props },
    slots: { default: slot },
    global: { plugins: [vuetify, i18n] },
  })
}

describe('FormField — label', () => {
  it('relie le label au contrôle par son identifiant', () => {
    const wrapper = monter({ controlId: 'animal-name' })

    const label = wrapper.get('label.form-field__label')
    expect(label.attributes('for')).toBe('animal-name')
    expect(label.text()).toContain('Nom')
    expect(wrapper.find('#animal-name').exists()).toBe(true)
  })

  it('porte un identifiant de label quand le contrôle est un groupe', () => {
    const wrapper = monter({ labelId: 'animal-species-label' })

    const label = wrapper.get('span.form-field__label')
    expect(label.attributes('id')).toBe('animal-species-label')
    expect(wrapper.find('label').exists()).toBe(false)
  })

  it('marque un champ obligatoire d’un astérisque hors lecture d’écran', () => {
    const wrapper = monter({ controlId: 'animal-name', required: true })

    const marque = wrapper.get('.form-field__required')
    expect(marque.text()).toBe('*')
    expect(marque.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.form-field__optional').exists()).toBe(false)
  })

  it('marque un champ optionnel de la mention « Optionnel »', () => {
    const wrapper = monter({ controlId: 'animal-breed' })

    expect(wrapper.get('.form-field__optional').text()).toBe('Optionnel')
    expect(wrapper.find('.form-field__required').exists()).toBe(false)
  })
})

describe('FormField — erreur', () => {
  it('affiche le message d’erreur reçu avec son icône', () => {
    const wrapper = monter({ controlId: 'animal-name', error: 'Le nom est obligatoire.' })

    const erreur = wrapper.get('.form-field__error')
    expect(erreur.text()).toBe('Le nom est obligatoire.')
    expect(erreur.find('.v-icon').exists()).toBe(true)
  })

  it('ne rend aucun message sans erreur', () => {
    const wrapper = monter({ controlId: 'animal-name', error: null })

    expect(wrapper.find('.form-field__error').exists()).toBe(false)
  })
})
