import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import WeightSection from '../WeightSection.vue'
import type { WeightEntry } from '../weight.schema'
import type { WeightRepository } from '../weight.repository'
import { provideWeightRepository } from '../weight.store'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

function entry(weightKg: number, measuredOn: string, animalId = MILO): WeightEntry {
  return {
    id: crypto.randomUUID(),
    animalId,
    weightKg,
    measuredOn,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
  }
}

let entries: WeightEntry[]
let listByAnimal: Mock<WeightRepository['listByAnimal']>

beforeEach(() => {
  setActivePinia(createPinia())
  entries = []
  listByAnimal = vi.fn<WeightRepository['listByAnimal']>(async (animalId) =>
    entries.filter((item) => item.animalId === animalId),
  )
  provideWeightRepository(() => ({
    listByAnimal,
    create: vi.fn<WeightRepository['create']>(),
    update: vi.fn<WeightRepository['update']>(),
    remove: vi.fn<WeightRepository['remove']>(),
  }))
})

afterEach(() => {
  provideWeightRepository(null)
})

async function monter(animalId = MILO) {
  const wrapper = mount(WeightSection, {
    props: { animalId },
    global: { plugins: [vuetify, i18n] },
  })
  await flushPromises()
  return wrapper
}

describe('WeightSection — chargement', () => {
  it('titre la section « Suivi de poids »', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.section-card__title').text()).toBe('Suivi de poids')
  })

  it('charge les pesées de l’animal reçu en prop et recharge quand il change', async () => {
    entries = [entry(4.2, '2026-08-01', LUNA)]
    const wrapper = await monter()
    expect(listByAnimal).toHaveBeenCalledExactlyOnceWith(MILO)

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(listByAnimal).toHaveBeenLastCalledWith(LUNA)
    expect(wrapper.get('.weight-section__current').text()).toBe('4,2')
  })
  it('n’affiche pas les pesées de l’animal précédent pendant le chargement du suivant', async () => {
    entries = [entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    listByAnimal.mockReturnValueOnce(new Promise(() => {}))

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(wrapper.find('.weight-section__current').exists()).toBe(false)
  })
})

describe('WeightSection — poids actuel et delta', () => {
  it('affiche la dernière pesée à une décimale et son unité', async () => {
    entries = [entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()

    expect(wrapper.get('.weight-section__current').text()).toBe('24,5')
    expect(wrapper.get('.weight-section__unit').text()).toBe('kg')
  })

  it('écrit une hausse en vert par rapport au mois de la pesée précédente', async () => {
    entries = [entry(24, '2026-08-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-section__delta')

    expect(delta.text()).toBe('+0,5 kg vs août')
    expect(delta.classes()).toContain('weight-section__delta--up')
  })

  it('écrit une baisse en gris chaud, jamais en rouge', async () => {
    entries = [entry(24.5, '2026-08-05'), entry(24.2, '2026-09-01')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-section__delta')

    expect(delta.text()).toBe('−0,3 kg vs août')
    expect(delta.classes()).toContain('weight-section__delta--down')
    expect(delta.classes()).not.toContain('weight-section__delta--up')
  })

  it('marque ± en gris neutre quand rien ne bouge', async () => {
    entries = [entry(24.5, '2026-08-05'), entry(24.5, '2026-09-01')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-section__delta')

    expect(delta.text()).toBe('±0,0 kg vs août')
    expect(delta.classes()).toContain('weight-section__delta--flat')
  })

  it('date la première pesée quand il n’y en a qu’une', async () => {
    entries = [entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-section__delta')

    expect(delta.text()).toBe('Première pesée · 8 nov. 2026')
    expect(delta.classes()).toContain('weight-section__delta--flat')
  })
})

describe('WeightSection — courbe', () => {
  it('trace la courbe à partir de deux pesées, valeurs au-dessus des points, mois dessous', async () => {
    entries = [entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    const sparkline = wrapper.get('.weight-sparkline')

    expect(sparkline.findAll('circle')).toHaveLength(2)
    expect(sparkline.find('polyline').exists()).toBe(true)
    expect(sparkline.findAll('.weight-sparkline__value').map((n) => n.text())).toEqual([
      '23,6',
      '24,5',
    ])
    expect(sparkline.findAll('.weight-sparkline__month').map((n) => n.text())).toEqual([
      'Juin',
      'Nov.',
    ])
    expect(wrapper.find('.weight-section__single').exists()).toBe(false)
  })

  it('invite à ajouter une deuxième pesée quand il n’y en a qu’une', async () => {
    entries = [entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    const single = wrapper.get('.weight-section__single')

    expect(single.text()).toBe('Ajoute une nouvelle pesée pour voir l’évolution.')
    expect(single.find('svg').exists()).toBe(true)
    expect(wrapper.find('.weight-sparkline').exists()).toBe(false)
  })
})

describe('WeightSection — état vide et lignes non livrées', () => {
  it('garde le titre et dit « Aucune pesée enregistrée » (C2)', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-section__empty').text()).toBe('Aucune pesée enregistrée')
    expect(wrapper.find('.weight-section__current').exists()).toBe(false)
    expect(wrapper.find('.weight-sparkline').exists()).toBe(false)
  })

  it('n’offre ni « Voir l’historique » ni « Ajouter une pesée » : leurs écrans n’existent pas', async () => {
    entries = [entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()

    expect(wrapper.find('.weight-section__history').exists()).toBe(false)
    expect(wrapper.find('.weight-section__add').exists()).toBe(false)
  })
})

describe('WeightSection — résumé pour le bandeau', () => {
  it('remonte la dernière pesée et son delta une fois chargé', async () => {
    entries = [entry(24, '2026-08-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()

    const summaries = wrapper.emitted('summary') ?? []
    expect(summaries[summaries.length - 1]).toEqual([
      {
        latest: { weightKg: 24.5, measuredOn: '2026-11-08' },
        delta: { kind: 'delta', deltaKg: 0.5, trend: 'up', previousMeasuredOn: '2026-08-05' },
      },
    ])
  })

  it('remonte null sans pesée', async () => {
    const wrapper = await monter()

    const summaries = wrapper.emitted('summary') ?? []
    expect(summaries[summaries.length - 1]).toEqual([null])
  })
})
