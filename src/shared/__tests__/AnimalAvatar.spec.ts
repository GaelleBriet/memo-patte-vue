import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AnimalAvatar from '../components/AnimalAvatar.vue'
import { animalAvatarGradientCss } from '../domain/animal-avatar-gradient'
import i18n from '@/core/i18n'

const MILO = { id: '11111111-1111-4111-8111-111111111111', name: 'Milo' }

// jsdom réécrit les couleurs hexadécimales d'un style en `rgb(…)`.
function enRgb(css: string): string {
  return css.replace(/#([0-9a-f]{6})/gi, (_, hex: string) => {
    const canal = (index: number) => Number.parseInt(hex.slice(index, index + 2), 16)
    return `rgb(${canal(0)}, ${canal(2)}, ${canal(4)})`
  })
}

function monter(photoUrl?: string | null) {
  return mount(AnimalAvatar, {
    props: { animal: { ...MILO, photoUrl } },
    global: { plugins: [i18n] },
  })
}

describe('AnimalAvatar', () => {
  it('affiche la photo, décrite par le prénom, quand elle existe', () => {
    const image = monter('blob:photo-milo').find('img')

    expect(image.attributes('src')).toBe('blob:photo-milo')
    expect(image.attributes('alt')).toBe(
      i18n.global.t('animals.chipSelector.photoAlt', { name: 'Milo' }),
    )
  })

  it('garde le dégradé de l’animal sans photo', () => {
    const wrapper = monter(null)

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.attributes('style')).toContain(enRgb(animalAvatarGradientCss(MILO.id)))
  })
})
