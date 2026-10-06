import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import vuetify from '@/core/theme/vuetify'
import FormCheckbox from '@/shared/form/FormCheckbox.vue'

function monter(props: { help?: string | null; disabled?: boolean; modelValue?: boolean } = {}) {
  return mount(FormCheckbox, {
    props: { label: 'Date approximative', modelValue: false, ...props },
    global: { plugins: [vuetify] },
  })
}

describe('FormCheckbox', () => {
  it('rend une vraie case à cocher, nommée par son libellé', () => {
    const wrapper = monter()

    expect(wrapper.get('label').text()).toBe('Date approximative')
    expect(wrapper.find('label input[type="checkbox"]').exists()).toBe(true)
  })

  it('émet la nouvelle valeur quand on la coche', async () => {
    const wrapper = monter()

    await wrapper.get('input').setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('relie l’aide à la case', () => {
    const wrapper = monter({ help: 'Disponible une fois la date saisie.' })

    const aide = wrapper.get('.form-checkbox__help')
    expect(aide.text()).toBe('Disponible une fois la date saisie.')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe(aide.attributes('id'))
  })

  it('place l’aide au-dessus de la case, comme la planche V13', () => {
    const wrapper = monter({ help: 'Disponible une fois la date saisie.' })

    const enfants = [...wrapper.element.children].map((noeud) => noeud.className)
    expect(enfants).toEqual(['form-checkbox__help', 'form-checkbox__box'])
  })

  it('n’a ni aide ni description sans texte d’aide', () => {
    const wrapper = monter()

    expect(wrapper.find('.form-checkbox__help').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
  })

  it('se désactive', () => {
    const wrapper = monter({ disabled: true })

    expect(wrapper.get<HTMLInputElement>('input').element.disabled).toBe(true)
    expect(wrapper.classes()).toContain('form-checkbox--disabled')
  })
})
