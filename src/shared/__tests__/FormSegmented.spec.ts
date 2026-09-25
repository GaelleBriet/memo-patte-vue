import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FormSegmented from '../form/FormSegmented.vue'
import vuetify from '@/core/theme/vuetify'

const OPTIONS = [
  { value: 'dog', label: 'Chien' },
  { value: 'cat', label: 'Chat' },
] as const

function monter(modelValue: 'dog' | 'cat' | null = null) {
  return mount(FormSegmented, {
    props: { modelValue, options: OPTIONS, labelId: 'animal-species-label' },
    global: { plugins: [vuetify] },
  })
}

function options(wrapper: ReturnType<typeof monter>) {
  return wrapper.findAll('.form-segmented button')
}

describe('FormSegmented', () => {
  it('rend un groupe de choix exclusifs relié à son label', () => {
    const wrapper = monter()

    expect(wrapper.get('.form-segmented').attributes('role')).toBe('radiogroup')
    expect(wrapper.get('.form-segmented').attributes('aria-labelledby')).toBe(
      'animal-species-label',
    )
    expect(options(wrapper).map((bouton) => bouton.text())).toEqual(['Chien', 'Chat'])
    expect(options(wrapper).map((bouton) => bouton.attributes('role'))).toEqual(['radio', 'radio'])
  })

  it('ne coche rien sans valeur', () => {
    const wrapper = monter()

    for (const bouton of options(wrapper)) {
      expect(bouton.attributes('aria-checked')).toBe('false')
      expect(bouton.find('.v-icon').exists()).toBe(false)
    }
  })

  it('coche l’option de la valeur reçue, avec sa coche', () => {
    const wrapper = monter('cat')

    expect(options(wrapper)[1]!.attributes('aria-checked')).toBe('true')
    expect(options(wrapper)[1]!.find('.v-icon').exists()).toBe(true)
    expect(options(wrapper)[0]!.attributes('aria-checked')).toBe('false')
  })

  it('émet la valeur de l’option tapée', async () => {
    const wrapper = monter()

    await options(wrapper)[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['dog']])
  })

  it('émet null quand on retape l’option déjà cochée', async () => {
    const wrapper = monter('dog')

    await options(wrapper)[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
  })

  it('n’émet jamais une valeur absente des options', async () => {
    const wrapper = monter('dog')

    wrapper.findComponent({ name: 'VBtnToggle' }).vm.$emit('update:modelValue', 'lapin')

    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
  })
})

describe('FormSegmented — options sur deux lignes', () => {
  const UNITES = [
    { value: 'kg', label: 'kg', hint: 'kilogrammes', ariaLabel: 'Kilogrammes, kg' },
    { value: 'lb', label: 'lb', hint: 'livres', ariaLabel: 'Livres, lb' },
  ] as const

  function monterUnites(modelValue: 'kg' | 'lb' = 'lb') {
    return mount(FormSegmented, {
      props: { modelValue, options: UNITES, labelId: 'weight-unit-label' },
      global: { plugins: [vuetify] },
    })
  }

  it('écrit l’abréviation puis son nom en dessous', () => {
    const boutons = monterUnites().findAll('.form-segmented button')

    expect(boutons.map((bouton) => bouton.get('.form-segmented__label').text())).toEqual([
      'kg',
      'lb',
    ])
    expect(boutons.map((bouton) => bouton.get('.form-segmented__hint').text())).toEqual([
      'kilogrammes',
      'livres',
    ])
  })

  it('donne à chaque option le nom lu par le lecteur d’écran', () => {
    const boutons = monterUnites().findAll('.form-segmented button')

    expect(boutons.map((bouton) => bouton.attributes('aria-label'))).toEqual([
      'Kilogrammes, kg',
      'Livres, lb',
    ])
  })

  it('marque l’option cochée par sa couleur seule, sans coche', () => {
    const boutons = monterUnites('lb').findAll('.form-segmented button')

    expect(boutons[1]!.attributes('aria-checked')).toBe('true')
    expect(boutons[1]!.find('.v-icon').exists()).toBe(false)
  })
})
