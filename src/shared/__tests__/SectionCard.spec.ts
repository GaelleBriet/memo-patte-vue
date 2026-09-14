import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SectionCard from '../SectionCard.vue'

type Props = InstanceType<typeof SectionCard>['$props']

function monter(props: Partial<Props> = {}, slots: Record<string, string> = {}) {
  return mount(SectionCard, { props: { title: 'À faire', ...props }, slots })
}

describe('SectionCard', () => {
  it('affiche le titre et le contenu dans la carte, sans compteur', () => {
    const wrapper = monter({}, { default: '<p class="ligne">Ligne</p>' })

    expect(wrapper.get('.section-card__title').text()).toBe('À faire')
    expect(wrapper.get('.section-card__card .ligne').text()).toBe('Ligne')
    expect(wrapper.find('.section-card__counter').exists()).toBe(false)
  })

  it('affiche le compteur à droite du titre, dans le même en-tête', () => {
    const wrapper = monter({ counter: '3 rappels' }, { default: '<p>Ligne</p>' })

    const heading = wrapper.get('.section-card__heading')
    expect(heading.element.children[0]?.classList).toContain('section-card__title')
    expect(heading.get('.section-card__counter').text()).toBe('3 rappels')
  })

  it('place le contenu d’introduction entre l’en-tête et la carte', () => {
    const wrapper = monter(
      {},
      { intro: '<div class="bandeau">1 rappel en retard</div>', default: '<p>Ligne</p>' },
    )

    const enfants = [...wrapper.element.children].map((el) => el.className)
    expect(enfants).toEqual(['section-card__heading', 'bandeau', 'section-card__card'])
  })

  it('ne rend pas de carte vide quand la section n’a pas de contenu', () => {
    const wrapper = monter({}, { intro: '<p class="etat">Tout est à jour</p>' })

    expect(wrapper.find('.section-card__card').exists()).toBe(false)
    expect(wrapper.get('.etat').text()).toBe('Tout est à jour')
  })
})
