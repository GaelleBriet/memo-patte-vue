import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'

import AnimalChipSelector from '../AnimalChipSelector.vue'
import type { AnimalChipItem } from '../AnimalChipSelector.vue'
import { animalAvatarGradientCss } from '../animal-avatar-gradient'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

const MILO: AnimalChipItem = { id: 'milo', name: 'Milo' }
const LUNA: AnimalChipItem = { id: 'luna', name: 'Luna' }

function monter(props: Record<string, unknown> = {}) {
  return mount(AnimalChipSelector, {
    props: { animals: [MILO, LUNA], ...props },
    global: { plugins: [vuetify, i18n] },
  })
}

function chip(wrapper: VueWrapper, index: number): DOMWrapper<Element> {
  const trouvee = wrapper.findAll('.animal-chip')[index]

  if (!trouvee) throw new Error(`Aucune chip animal à l'index ${index}`)

  return trouvee
}

/** Sélections émises par le composant, dans l'ordre. */
function selectionsEmises(wrapper: VueWrapper): unknown[] {
  return (wrapper.emitted('update:selectedId') ?? []).map(([valeur]) => valeur)
}

function derniereSelection(wrapper: VueWrapper): unknown {
  const emises = selectionsEmises(wrapper)

  return emises[emises.length - 1]
}

/** `#RRGGBB` → `rgb(r, g, b)`, la forme que jsdom écrit dans l'attribut `style`. */
function enRgb(css: string): string {
  return css.replace(/#([0-9a-f]{6})/gi, (_, hex: string) => {
    const canal = (index: number) => Number.parseInt(hex.slice(index, index + 2), 16)

    return `rgb(${canal(0)}, ${canal(2)}, ${canal(4)})`
  })
}

describe('AnimalChipSelector', () => {
  it('rend une chip par animal et la chip « + » en fin de rangée', () => {
    const wrapper = monter()

    expect(wrapper.findAll('.animal-chip')).toHaveLength(2)
    expect(chip(wrapper, 0).text()).toContain('Milo')
    expect(chip(wrapper, 1).text()).toContain('Luna')
    expect(wrapper.find('.animal-chip-selector__add').exists()).toBe(true)
  })

  it('émet le clic sur la chip « + »', async () => {
    const wrapper = monter()

    await wrapper.find('.animal-chip-selector__add').trigger('click')

    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  it('marque la chip sélectionnée', () => {
    const wrapper = monter({ selectedId: 'luna' })

    expect(chip(wrapper, 1).classes()).toContain('animal-chip--selected')
    expect(chip(wrapper, 0).classes()).not.toContain('animal-chip--selected')
  })

  it('émet l’animal choisi quand on clique une chip inactive', async () => {
    const wrapper = monter({ mode: 'filter', selectedId: null })

    await chip(wrapper, 0).trigger('click')

    expect(derniereSelection(wrapper)).toBe('milo')
  })

  it('accueil : re-cliquer sur la chip active revient à « tous les animaux »', async () => {
    const wrapper = monter({ mode: 'filter', selectedId: 'milo' })

    await chip(wrapper, 0).trigger('click')

    expect(derniereSelection(wrapper)).toBeNull()
  })

  it('carnet : re-cliquer sur la chip active ne désélectionne pas', async () => {
    const wrapper = monter({ mode: 'switch', selectedId: 'milo' })

    await chip(wrapper, 0).trigger('click')

    expect(selectionsEmises(wrapper)).not.toContain(null)
    expect(chip(wrapper, 0).classes()).toContain('animal-chip--selected')
  })

  it('carnet : cliquer une autre chip change l’animal consulté', async () => {
    const wrapper = monter({ mode: 'switch', selectedId: 'milo' })

    await chip(wrapper, 1).trigger('click')

    expect(derniereSelection(wrapper)).toBe('luna')
  })

  it('affiche la photo de l’animal quand elle existe', () => {
    const wrapper = monter({ animals: [{ ...MILO, photoUrl: 'blob:photo-milo' }] })

    const image = wrapper.find('.animal-chip__avatar img')
    expect(image.exists()).toBe(true)
    expect(image.attributes('src')).toBe('blob:photo-milo')
  })

  it('affiche un dégradé de couleur en l’absence de photo', () => {
    const wrapper = monter({ animals: [MILO] })

    expect(wrapper.find('.animal-chip__avatar img').exists()).toBe(false)
    expect(wrapper.find('.animal-chip__avatar').attributes('style')).toContain(
      // jsdom réécrit les hexadécimaux en `rgb()` dans l'attribut `style`.
      enRgb(animalAvatarGradientCss(MILO.id)),
    )
  })

  it('rend le même dégradé pour un même animal d’un rendu à l’autre', () => {
    const premier = monter({ animals: [MILO] })
      .find('.animal-chip__avatar')
      .attributes('style')
    const second = monter({ animals: [MILO] })
      .find('.animal-chip__avatar')
      .attributes('style')

    expect(second).toBe(premier)
  })

  it('n’affiche aucune chip animal quand la liste est vide, mais garde la chip « + »', () => {
    const wrapper = monter({ animals: [] })

    expect(wrapper.findAll('.animal-chip')).toHaveLength(0)
    expect(wrapper.find('.animal-chip-selector__add').exists()).toBe(true)
  })
})
