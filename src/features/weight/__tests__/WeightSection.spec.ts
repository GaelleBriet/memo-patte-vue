import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import WeightSection from '../views/WeightSection.vue'
import WeightSheet from '../views/WeightSheet.vue'
import type { WeightEntry } from '../schema/weight.schema'
import type { WeightRepository } from '../repository/weight.repository'
import { provideWeightRepository, useWeightStore } from '../store/weight.store'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { toKg } from '@/shared/domain/weight-unit'
import { applyWeightUnit } from '@/shared/domain/weight-unit-preference'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'
const TODAY = '2026-11-10'

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
let create: Mock<WeightRepository['create']>
let wrapper: VueWrapper | null = null
let routeur: Router

const Vide = { render: () => null }

beforeEach(() => {
  // jsdom ne fournit pas `visualViewport`, que la feuille de pesée (VDialog) écoute.
  vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
  setActivePinia(createPinia())
  routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/animals', name: 'animals', component: Vide },
      { path: '/animals/:animalId/weight', name: 'weight-history', component: Vide },
    ],
  })
  entries = []
  listByAnimal = vi.fn<WeightRepository['listByAnimal']>(async (animalId) =>
    entries.filter((item) => item.animalId === animalId),
  )
  create = vi.fn<WeightRepository['create']>(async (input) => {
    const created = { ...entry(input.weightKg, input.measuredOn, input.animalId) }
    entries = [...entries, created]
    return created
  })
  provideWeightRepository(() => ({
    listByAnimal,
    create,
    update: vi.fn<WeightRepository['update']>(async (id, input) => {
      const updated = { ...entries.find((item) => item.id === id)!, ...input }
      entries = entries.map((item) => (item.id === id ? updated : item))
      return updated
    }),
    remove: vi.fn<WeightRepository['remove']>(async (id) => {
      entries = entries.filter((item) => item.id !== id)
    }),
    undoRemove: vi.fn<WeightRepository['undoRemove']>(),
  }))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  provideWeightRepository(null)
  applyWeightUnit('kg')
  vi.unstubAllGlobals()
})

async function monter(animalId = MILO, today = TODAY) {
  wrapper = mount(WeightSection, {
    props: { animalId, today },
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function feuille(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.weight-sheet .bottom-sheet__panel')
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

  it('écrit une hausse en vert par rapport à la date de la pesée précédente', async () => {
    entries = [entry(24, '2026-08-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-section__delta')

    expect(delta.text()).toBe('+0,5\u00a0kg depuis le\u00a05\u00a0août')
    expect(delta.classes()).toContain('weight-section__delta--up')
  })

  it('écrit une baisse en gris chaud, jamais en rouge', async () => {
    entries = [entry(24.5, '2026-08-05'), entry(24.2, '2026-09-01')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-section__delta')

    expect(delta.text()).toBe('−0,3\u00a0kg depuis le\u00a05\u00a0août')
    expect(delta.classes()).toContain('weight-section__delta--down')
    expect(delta.classes()).not.toContain('weight-section__delta--up')
  })

  it('marque ± en gris neutre quand rien ne bouge', async () => {
    entries = [entry(24.5, '2026-08-05'), entry(24.5, '2026-09-01')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-section__delta')

    expect(delta.text()).toBe('±0,0\u00a0kg depuis le\u00a05\u00a0août')
    expect(delta.classes()).toContain('weight-section__delta--flat')
  })

  it('distingue deux pesées du même mois par le jour de la pesée de référence', async () => {
    entries = [entry(23.9, '2026-08-04'), entry(24.2, '2026-08-25'), entry(24.5, '2026-09-13')]
    const wrapper = await monter(MILO, '2026-09-24')

    expect(wrapper.get('.weight-section__delta').text()).toBe(
      '+0,3\u00a0kg depuis le\u00a025\u00a0août',
    )
  })

  it('ajoute l’année quand la pesée de référence n’est pas de l’année en cours', async () => {
    entries = [entry(23.9, '2025-12-20'), entry(24.2, '2026-01-10')]
    const wrapper = await monter(MILO, '2026-01-12')

    expect(wrapper.get('.weight-section__delta').text()).toBe(
      '+0,3\u00a0kg depuis le\u00a020\u00a0déc.\u00a02025',
    )
  })

  it('écrit la date à l’anglaise en anglais', async () => {
    entries = [entry(23.9, '2025-12-20'), entry(24.2, '2026-08-25'), entry(24.5, '2026-09-13')]
    applyLocale('en')

    try {
      const wrapper = await monter(MILO, '2026-09-24')

      expect(wrapper.get('.weight-section__delta').text()).toBe(
        '+0.3\u00a0kg since\u00a0Aug\u00a025',
      )
    } finally {
      applyLocale('fr')
    }
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
  it('trace la courbe à partir de deux pesées : mois dessous, plus bas et dernière pesée écrits', async () => {
    entries = [entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    const sparkline = wrapper.get('.weight-sparkline')

    expect(sparkline.findAll('circle')).toHaveLength(2)
    expect(sparkline.find('polyline').exists()).toBe(true)
    expect(sparkline.findAll('.weight-chart-trace__month').map((n) => n.text())).toEqual([
      'Juin',
      'Juil.',
      'Août',
      'Sept.',
      'Oct.',
      'Nov.',
    ])
    expect(sparkline.findAll('.weight-sparkline__extreme').map((n) => n.text())).toEqual([
      'min 23,6',
    ])
    expect(sparkline.get('.weight-sparkline__latest').text()).toBe('24,5 kg')
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

describe('WeightSection — état vide', () => {
  it('garde le titre et dit « Aucune pesée enregistrée » (C2)', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-section__empty').text()).toBe('Aucune pesée enregistrée')
    expect(wrapper.find('.weight-section__current').exists()).toBe(false)
    expect(wrapper.find('.weight-sparkline').exists()).toBe(false)
  })
})

describe('WeightSection — voir l’historique', () => {
  it('mène au suivi de poids de l’animal, à droite du poids actuel', async () => {
    entries = [entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()

    const lien = wrapper.get('.weight-section__headline .weight-section__history')
    expect(lien.text()).toBe('Voir l’historique')
    expect(lien.find('svg').exists()).toBe(true)
    expect(lien.attributes('href')).toBe(`/animals/${MILO}/weight`)
  })

  it('s’offre dès la première pesée', async () => {
    entries = [entry(24.5, '2026-11-08')]
    const wrapper = await monter()

    expect(wrapper.find('.weight-section__history').exists()).toBe(true)
  })

  it('reste absent sans pesée', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.weight-section__history').exists()).toBe(false)
  })
})

describe('WeightSection — ajouter une pesée', () => {
  it('termine la carte par « Ajouter une pesée », même sans pesée', async () => {
    const wrapper = await monter()
    const ajout = wrapper.get('.section-card__add')

    expect(ajout.text()).toBe('Ajouter une pesée')
    expect(ajout.classes()).toContain('weight-section__add')
    expect(wrapper.findAll('.section-card__add')).toHaveLength(1)
    expect(feuille()).toBeNull()
  })

  it('ouvre la feuille de pesée fermée par défaut, pour l’animal courant', async () => {
    const wrapper = await monter()
    const sheet = wrapper.getComponent(WeightSheet)
    expect(sheet.props('modelValue')).toBe(false)

    await wrapper.get('.weight-section__add').trigger('click')
    await flushPromises()

    expect(sheet.props('modelValue')).toBe(true)
    expect(sheet.props('animalId')).toBe(MILO)
    expect(feuille()).not.toBeNull()
  })

  it('met la carte à jour et ferme la feuille une fois la pesée enregistrée', async () => {
    const wrapper = await monter()
    await wrapper.get('.weight-section__add').trigger('click')
    await flushPromises()

    const poids = feuille()?.querySelector<HTMLInputElement>('#weight-sheet-kg')
    if (!poids) throw new Error('Champ poids absent')
    poids.value = '24,5'
    poids.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    feuille()?.querySelector<HTMLButtonElement>('.weight-sheet__submit')?.click()
    await flushPromises()

    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ animalId: MILO, weightKg: 24.5 }),
    )
    expect(wrapper.get('.weight-section__current').text()).toBe('24,5')
    expect(wrapper.getComponent(WeightSheet).props('modelValue')).toBe(false)
  })
})

describe('WeightSection — pesée corrigée ou supprimée depuis l’Historique', () => {
  it('suit aussitôt une pesée corrigée', async () => {
    const derniere = entry(2.45, '2026-11-08')
    entries = [entry(24, '2026-08-05'), derniere]
    const wrapper = await monter()

    await useWeightStore().update(derniere.id, { weightKg: 24.5, measuredOn: '2026-09-08' })
    await flushPromises()

    expect(wrapper.get('.weight-section__current').text()).toBe('24,5')
    expect(wrapper.get('.weight-section__delta').text()).toContain('+0,5\u00a0kg')
  })

  it('suit aussitôt une pesée supprimée', async () => {
    const derniere = entry(2.45, '2026-11-08')
    entries = [entry(24, '2026-08-05'), derniere]
    const wrapper = await monter()

    await useWeightStore().remove(derniere.id)
    await flushPromises()

    expect(wrapper.get('.weight-section__current').text()).toBe('24,0')
    expect(wrapper.find('.weight-section__chart').exists()).toBe(false)
  })
})

describe('WeightSection — retour du focus', () => {
  it('rend le focus à « Ajouter une pesée » une fois la pesée enregistrée', async () => {
    const wrapper = await monter()
    const ajout = wrapper.get<HTMLButtonElement>('.weight-section__add').element
    ajout.focus()
    ajout.click()
    await flushPromises()

    const poids = feuille()?.querySelector<HTMLInputElement>('#weight-sheet-kg')
    if (!poids) throw new Error('Champ poids absent')
    poids.value = '24,5'
    poids.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    feuille()?.querySelector<HTMLButtonElement>('.weight-sheet__submit')?.click()
    await flushPromises()

    expect(document.activeElement).toBe(ajout)
  })
})

describe('WeightSection — pendant une écriture', () => {
  it('garde la carte affichée pendant l’enregistrement d’une pesée', async () => {
    entries = [entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    create.mockReturnValueOnce(new Promise(() => {}))

    void useWeightStore().create({ animalId: MILO, weightKg: 25, measuredOn: '2026-11-20' })
    await flushPromises()

    expect(useWeightStore().isLoading).toBe(true)
    expect(wrapper.get('.weight-section__current').text()).toBe('24,5')
    expect(wrapper.find('.weight-sparkline').exists()).toBe(true)
    expect(wrapper.find('.weight-section__empty').exists()).toBe(false)
  })
})

describe('WeightSection — chargement en échec', () => {
  it('dit que les pesées n’ont pas pu être chargées, sans état vide, résumé null', async () => {
    listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()

    expect(wrapper.get('.weight-section__error').text()).toBe('Impossible de charger les pesées.')
    expect(wrapper.find('.weight-section__empty').exists()).toBe(false)
    expect(wrapper.find('.weight-section__current').exists()).toBe(false)
    const summaries = wrapper.emitted('summary') ?? []
    expect(summaries[summaries.length - 1]).toEqual([null])
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
        delta: {
          kind: 'delta',
          previousKg: 24,
          latestKg: 24.5,
          trend: 'up',
          previousMeasuredOn: '2026-08-05',
        },
      },
    ])
  })

  it('remonte null sans pesée', async () => {
    const wrapper = await monter()

    const summaries = wrapper.emitted('summary') ?? []
    expect(summaries[summaries.length - 1]).toEqual([null])
  })
})

describe('WeightSection — en livres', () => {
  it('écrit le poids actuel, sa variation et la courbe en livres', async () => {
    applyWeightUnit('lb')
    entries = [entry(toKg(53.3, 'lb'), '2026-08-25'), entry(toKg(54, 'lb'), '2026-11-08')]
    const wrapper = await monter()

    expect(wrapper.get('.weight-section__current').text()).toBe('54,0')
    expect(wrapper.get('.weight-section__unit').text()).toBe('lb')
    expect(wrapper.get('.weight-section__delta').text()).toBe(
      '+0,7\u00a0lb depuis le\u00a025\u00a0août',
    )
    expect(wrapper.get('.weight-sparkline__latest').text()).toBe('54,0\u00a0lb')
  })

  it('suit un changement d’unité sans être remontée', async () => {
    entries = [entry(24, '2026-08-05'), entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    expect(wrapper.get('.weight-section__current').text()).toBe('24,5')

    applyWeightUnit('lb')
    await nextTick()

    expect(wrapper.get('.weight-section__current').text()).toBe('54,0')
    expect(wrapper.get('.weight-section__unit').text()).toBe('lb')
    expect(wrapper.get('.weight-section__delta').text()).toBe(
      '+1,1\u00a0lb depuis le\u00a05\u00a0août',
    )
  })
})
