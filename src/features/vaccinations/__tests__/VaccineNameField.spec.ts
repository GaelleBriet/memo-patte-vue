import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import VaccineNameField from '../views/VaccineNameField.vue'
import type { Vaccination } from '../schema/vaccination.schema'
import { useVaccinationsStore } from '../store/vaccinations.store'
import type { Animal, AnimalSpecies } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

function animal(id: string, name: string, species: AnimalSpecies): Animal {
  return {
    id,
    name,
    species,
    breed: null,
    birthDate: null,
    birthDateApproximate: false,
    photoPath: null,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
  }
}

function vaccination(animalId: string, name: string): Vaccination {
  return {
    id: crypto.randomUUID(),
    animalId,
    name,
    lastInjectionDate: '2026-03-12',
    dueDate: null,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
  }
}

const MILO = animal('milo', 'Milo', 'dog')
const LUNA = animal('luna', 'Luna', 'dog')
const PIXEL = animal('pixel', 'Pixel', 'cat')

beforeEach(() => {
  setActivePinia(createPinia())
  useAnimalsStore().animals = [MILO, LUNA, PIXEL]
  vi.spyOn(useVaccinationsStore(), 'listAll').mockResolvedValue([
    vaccination(MILO.id, 'CHPPi'),
    vaccination(LUNA.id, 'chppi'),
    vaccination(PIXEL.id, 'Typhus'),
  ])
})

afterEach(() => {
  vi.restoreAllMocks()
  applyLocale('fr')
  document.body.innerHTML = ''
})

async function monter(species: AnimalSpecies = 'dog', modelValue = '') {
  const wrapper = mount(VaccineNameField, {
    props: {
      modelValue,
      species,
      error: null,
      'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }),
    },
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const texte = (wrapper: Awaited<ReturnType<typeof monter>>) =>
  wrapper.find('.vaccine-name-field__list').text()

describe('VaccineNameField', () => {
  it('ne propose rien avant la frappe, même avec un nom déjà saisi', async () => {
    const wrapper = await monter('dog', 'Rage')

    expect(wrapper.find('.vaccine-name-field__list').exists()).toBe(false)
  })

  it('propose pendant la frappe les noms du carnet, puis les combinaisons de l’espèce, puis le texte tapé', async () => {
    const wrapper = await monter()

    await wrapper.find('input').setValue('chp')

    const options = wrapper.findAll('[role="option"]').map((option) => option.text())
    expect(texte(wrapper)).toContain('Dans ton carnet')
    expect(options[0]).toContain('CHPPi')
    expect(options[0]).toContain('Déjà utilisé pour Milo et Luna')
    expect(texte(wrapper)).toContain('Combinaisons courantes · chien')
    expect(options[1]).toContain('Carré, hépatite, parvovirose')
    expect(options[1]).toContain('CHP · DAP')
    expect(options.at(-1)).toBe('Utiliser « chp »')
    expect(texte(wrapper)).not.toContain('Typhus')
  })

  it('remplit le champ avec la proposition choisie et ferme la liste', async () => {
    const wrapper = await monter()

    await wrapper.find('input').setValue('dhppil')
    await wrapper.findAll('[role="option"]')[0]!.trigger('click')

    expect(wrapper.props('modelValue')).toBe(
      'Carré, hépatite, parvovirose, parainfluenza, leptospirose',
    )
    expect(wrapper.find('.vaccine-name-field__list').exists()).toBe(false)
  })

  it('garde le texte tapé quand il est choisi', async () => {
    const wrapper = await monter()

    await wrapper.find('input').setValue('chp')
    await wrapper.findAll('[role="option"]').at(-1)!.trigger('click')

    expect(wrapper.props('modelValue')).toBe('chp')
    expect(wrapper.find('.vaccine-name-field__list').exists()).toBe(false)
  })

  it('propose les combinaisons du chat à un chat', async () => {
    const wrapper = await monter('cat')

    await wrapper.find('input').setValue('rcp')

    expect(texte(wrapper)).toContain('Combinaisons courantes · chat')
    expect(texte(wrapper)).toContain('Typhus, coryza (herpèsvirus, calicivirus)')
    expect(texte(wrapper)).not.toContain('CHPPi')
  })

  it('n’affiche aucune liste quand rien ne correspond', async () => {
    const wrapper = await monter()

    await wrapper.find('input').setValue('Vaccin maison')

    expect(wrapper.find('.vaccine-name-field__list').exists()).toBe(false)
  })

  it('propose en anglais', async () => {
    applyLocale('en')
    const wrapper = await monter()

    await wrapper.find('input').setValue('chp')

    expect(texte(wrapper)).toContain('In your health record')
    expect(texte(wrapper)).toContain('Already used for Milo and Luna')
    expect(texte(wrapper)).toContain('Common combinations · dog')
    expect(texte(wrapper)).toContain('Distemper, hepatitis, parvovirus')
    expect(texte(wrapper)).toContain('Use “chp”')
  })

  it('propose les combinaisons même si le carnet ne se lit pas', async () => {
    vi.spyOn(useVaccinationsStore(), 'listAll').mockRejectedValue(new Error('SQLite'))
    const wrapper = await monter()

    await wrapper.find('input').setValue('chp')

    expect(texte(wrapper)).not.toContain('Dans ton carnet')
    expect(texte(wrapper)).toContain('Carré, hépatite, parvovirose')
  })
})
