import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PasswordField from '../form/PasswordField.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

type Props = InstanceType<typeof PasswordField>['$props']

function monter(props: Partial<Props> = {}) {
  return mount(PasswordField, {
    props: {
      label: 'Mot de passe',
      controlId: 'mot-de-passe',
      autocomplete: 'current-password',
      modelValue: '',
      ...props,
    },
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  i18n.global.locale.value = 'fr'
  vi.restoreAllMocks()
})

describe('PasswordField — champ', () => {
  it('relie le label au champ, masqué par défaut', () => {
    const w = monter()

    expect(w.get('label[for="mot-de-passe"]').text()).toContain('Mot de passe')
    expect(w.get('#mot-de-passe').attributes('type')).toBe('password')
  })

  it.each(['current-password', 'new-password'] as const)(
    'garde l’autocomplétion « %s » pour le gestionnaire de mots de passe',
    (autocomplete) => {
      const w = monter({ autocomplete })

      expect(w.get('#mot-de-passe').attributes('autocomplete')).toBe(autocomplete)
    },
  )

  it('rend la saisie par v-model', async () => {
    const w = monter({ modelValue: 'secret' })

    expect((w.get('#mot-de-passe').element as HTMLInputElement).value).toBe('secret')
    await w.get('#mot-de-passe').setValue('nouveau')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['nouveau'])
  })

  it('marque le champ invalide et l’associe à son erreur', () => {
    const w = monter({ error: 'Indique ton mot de passe.', required: true })

    const input = w.get('#mot-de-passe')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-required')).toBe('true')
    const errorId = w.get('.form-field__error').attributes('id')
    expect(input.attributes('aria-describedby')).toContain(errorId)
  })

  it('affiche l’aide sous le champ', () => {
    const w = monter({ help: 'Au moins 8 caractères.' })

    expect(w.get('.form-field__help').text()).toBe('Au moins 8 caractères.')
  })

  it('peut prendre le focus à l’ouverture', () => {
    expect(monter({ autofocus: true }).get('#mot-de-passe').attributes('autofocus')).toBeDefined()
    expect(monter().get('#mot-de-passe').attributes('autofocus')).toBeUndefined()
  })
})

describe('PasswordField — icône œil', () => {
  it('propose « Afficher le mot de passe » tant que la saisie est masquée', () => {
    const w = monter()

    const bouton = w.get('.password-field__toggle')
    expect(bouton.attributes('type')).toBe('button')
    expect(bouton.attributes('aria-label')).toBe('Afficher le mot de passe')
    expect(bouton.find('.v-icon').exists()).toBe(true)
  })

  it('affiche la saisie, puis la masque de nouveau', async () => {
    const w = monter({ modelValue: 'secret' })

    await w.get('.password-field__toggle').trigger('click')
    expect(w.get('#mot-de-passe').attributes('type')).toBe('text')
    expect(w.get('.password-field__toggle').attributes('aria-label')).toBe(
      'Masquer le mot de passe',
    )

    await w.get('.password-field__toggle').trigger('click')
    expect(w.get('#mot-de-passe').attributes('type')).toBe('password')
    expect(w.get('.password-field__toggle').attributes('aria-label')).toBe(
      'Afficher le mot de passe',
    )
  })

  it('change d’icône selon l’état', async () => {
    const w = monter()
    const masque = w.get('.password-field__toggle').html()

    await w.get('.password-field__toggle').trigger('click')

    expect(w.get('.password-field__toggle').html()).not.toBe(masque)
  })

  it('ne touche pas à la saisie', async () => {
    const w = monter({ modelValue: 'secret' })

    await w.get('.password-field__toggle').trigger('click')

    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect((w.get('#mot-de-passe').element as HTMLInputElement).value).toBe('secret')
  })

  it('repart masqué quand l’écran est rouvert, sans rien écrire dans le stockage', async () => {
    const ecriture = vi.spyOn(Storage.prototype, 'setItem')
    const premier = monter()
    await premier.get('.password-field__toggle').trigger('click')
    premier.unmount()

    const second = monter()

    expect(second.get('#mot-de-passe').attributes('type')).toBe('password')
    expect(ecriture).not.toHaveBeenCalled()
  })

  it('garde un état propre à chaque champ', async () => {
    const premier = monter({ controlId: 'premier' })
    const second = monter({ controlId: 'second' })

    await premier.get('.password-field__toggle').trigger('click')

    expect(premier.get('#premier').attributes('type')).toBe('text')
    expect(second.get('#second').attributes('type')).toBe('password')
  })

  it('se nomme en anglais', async () => {
    i18n.global.locale.value = 'en'
    const w = monter()

    expect(w.get('.password-field__toggle').attributes('aria-label')).toBe('Show password')
    await w.get('.password-field__toggle').trigger('click')
    expect(w.get('.password-field__toggle').attributes('aria-label')).toBe('Hide password')
  })
})
