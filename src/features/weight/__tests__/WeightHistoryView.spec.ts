import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import WeightHistoryView from '../WeightHistoryView.vue'
import WeightSheet from '../WeightSheet.vue'
import type { WeightEntry } from '../weight.schema'
import type { WeightRepository } from '../weight.repository'
import { provideWeightRepository, useWeightStore } from '../weight.store'
import type { Animal } from '@/features/animals/animal.schema'
import { useAnimalsStore } from '@/features/animals/animals.store'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'

const Vide = { render: () => null }

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  initialWeightKg: 8.5,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

function entry(weightKg: number, measuredOn: string, animalId = MILO.id): WeightEntry {
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

const HISTORIQUE_MILO = [
  entry(23.6, '2026-06-07'),
  entry(23.8, '2026-07-12'),
  entry(24, '2026-08-09'),
  entry(24.2, '2026-09-13'),
  entry(24.3, '2026-10-11'),
  entry(24.5, '2026-11-08'),
]

let entries: WeightEntry[]
let animals: Animal[]
let listByAnimal: Mock<WeightRepository['listByAnimal']>
let create: Mock<WeightRepository['create']>
let loadAnimals: MockInstance
let push: MockInstance
let routeur: Router
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
  setActivePinia(createPinia())
  entries = []
  animals = [MILO]
  listByAnimal = vi.fn<WeightRepository['listByAnimal']>(async (animalId) =>
    entries.filter((item) => item.animalId === animalId),
  )
  create = vi.fn<WeightRepository['create']>()
  provideWeightRepository(() => ({
    listByAnimal,
    create,
    update: vi.fn<WeightRepository['update']>(),
    remove: vi.fn<WeightRepository['remove']>(),
  }))
  const store = useAnimalsStore()
  loadAnimals = vi.spyOn(store, 'load').mockImplementation(async () => {
    store.animals = animals
    store.hasLoaded = true
    return true
  })
  routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/animals', name: 'animals', component: Vide },
      { path: '/animals/:animalId/weight', name: 'weight-history', component: Vide },
    ],
  })
  await routeur.push(`/animals/${MILO.id}/weight`)
  push = vi.spyOn(routeur, 'push').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  provideWeightRepository(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter(animalId = MILO.id) {
  wrapper = mount(WeightHistoryView, {
    props: { animalId },
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('WeightHistoryView — top bar', () => {
  it('titre « Suivi de poids » avec le prénom de l’animal en dessous', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__title').text()).toBe('Suivi de poids')
    expect(wrapper.get('.weight-history__subtitle').text()).toBe('Milo')
  })

  it('charge les animaux s’ils ne le sont pas, et les pesées de l’animal de l’URL', async () => {
    await monter()

    expect(loadAnimals).toHaveBeenCalledOnce()
    expect(listByAnimal).toHaveBeenCalledExactlyOnceWith(MILO.id)
  })

  it('borde la top bar dès que le contenu défile', async () => {
    entries = [...HISTORIQUE_MILO]
    const wrapper = await monter()
    const scroll = wrapper.get('.weight-history__scroll')
    expect(wrapper.get('.weight-history__topbar').classes()).not.toContain(
      'weight-history__topbar--scrolled',
    )

    scroll.element.scrollTop = 40
    await scroll.trigger('scroll')

    expect(wrapper.get('.weight-history__topbar').classes()).toContain(
      'weight-history__topbar--scrolled',
    )
  })

  it('suit l’animal de la route : un nouvel identifiant recharge ses pesées', async () => {
    const luna: Animal = { ...MILO, id: '33333333-3333-4333-8333-333333333333', name: 'Luna' }
    animals = [MILO, luna]
    entries = [...HISTORIQUE_MILO, entry(4.2, '2026-08-01', luna.id)]
    const wrapper = await monter()

    await wrapper.setProps({ animalId: luna.id })
    await flushPromises()

    expect(listByAnimal).toHaveBeenLastCalledWith(luna.id)
    expect(wrapper.get('.weight-history__subtitle').text()).toBe('Luna')
    expect(wrapper.get('.weight-history__current').text()).toBe('4,2')
  })

  it('revient au Carnet par la flèche retour', async () => {
    const wrapper = await monter()

    await wrapper.get('.weight-history__back').trigger('click')

    expect(push).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
  })
})

describe('WeightHistoryView — H1 historique complet', () => {
  beforeEach(() => {
    entries = [...HISTORIQUE_MILO]
  })

  it('met en avant le poids actuel et son évolution depuis la pesée précédente', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__current-label').text()).toBe('Poids actuel')
    expect(wrapper.get('.weight-history__current').text()).toBe('24,5')
    expect(wrapper.get('.weight-history__unit').text()).toBe('kg')
    const delta = wrapper.get('.weight-history__delta')
    expect(delta.text()).toBe('+0,2 kg vs octobre')
    expect(delta.classes()).toContain('weight-history__delta--up')
  })

  it('trace la courbe dans le sens du temps, sans carte « une seule pesée »', async () => {
    const wrapper = await monter()
    const sparkline = wrapper.get('.weight-sparkline')

    expect(sparkline.findAll('.weight-sparkline__value').map((n) => n.text())).toEqual([
      '23,6',
      '23,8',
      '24,0',
      '24,2',
      '24,3',
      '24,5',
    ])
    expect(sparkline.findAll('.weight-sparkline__month').map((n) => n.text())).toEqual([
      'Juin',
      'Juil.',
      'Août',
      'Sept.',
      'Oct.',
      'Nov.',
    ])
    expect(wrapper.find('.weight-history__single').exists()).toBe(false)
  })

  it('liste toutes les pesées, la plus récente en haut, avec leur delta', async () => {
    const wrapper = await monter()
    const lignes = wrapper.findAll('.weight-history__row')

    expect(wrapper.get('.section-card__title').text()).toBe('Toutes les pesées')
    expect(lignes).toHaveLength(6)
    expect(lignes.map((l) => l.get('.weight-history__row-date').text())).toEqual([
      '8 nov. 2026',
      '11 oct. 2026',
      '13 sept. 2026',
      '9 août 2026',
      '12 juil. 2026',
      '7 juin 2026',
    ])
    expect(lignes.map((l) => l.get('.weight-history__row-delta').text())).toEqual([
      '+0,2 kg',
      '+0,1 kg',
      '+0,2 kg',
      '+0,2 kg',
      '+0,2 kg',
      '',
    ])
    expect(lignes.map((l) => l.get('.weight-history__row-value').text())).toEqual([
      '24,5 kg',
      '24,3 kg',
      '24,2 kg',
      '24,0 kg',
      '23,8 kg',
      '23,6 kg',
    ])
    expect(lignes[0]!.get('.weight-history__row-delta').classes()).toContain(
      'weight-history__delta--up',
    )
  })

  it('affiche le poids à l’arrivée sous la liste', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__initial').text()).toBe('Poids à l’arrivée : 8,5 kg')
  })

  it('offre le bouton fixe « Ajouter une pesée », qui ouvre la feuille pour cet animal', async () => {
    const wrapper = await monter()
    const sheet = wrapper.getComponent(WeightSheet)
    expect(sheet.props('modelValue')).toBe(false)
    expect(wrapper.find('.weight-history__empty').exists()).toBe(false)

    const bouton = wrapper.get('.weight-history__add')
    expect(bouton.text()).toBe('Ajouter une pesée')
    await bouton.trigger('click')
    await flushPromises()

    expect(sheet.props('modelValue')).toBe(true)
    expect(sheet.props('animalId')).toBe(MILO.id)
  })
})

describe('WeightHistoryView — pendant une écriture', () => {
  it('garde le poids actuel, les lignes et le bouton fixe pendant l’enregistrement', async () => {
    entries = [...HISTORIQUE_MILO]
    const wrapper = await monter()
    create.mockReturnValueOnce(new Promise(() => {}))

    void useWeightStore().create({ animalId: MILO.id, weightKg: 25, measuredOn: '2026-11-20' })
    await flushPromises()

    expect(useWeightStore().isLoading).toBe(true)
    expect(wrapper.get('.weight-history__current').text()).toBe('24,5')
    expect(wrapper.findAll('.weight-history__row')).toHaveLength(6)
    expect(wrapper.find('.weight-history__add').exists()).toBe(true)
    expect(wrapper.find('.weight-history__loading').exists()).toBe(false)
  })
})

describe('WeightHistoryView — deltas du poids actuel', () => {
  it('écrit une baisse en gris chaud', async () => {
    entries = [entry(24.5, '2026-08-09'), entry(24.2, '2026-09-13')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-history__delta')

    expect(delta.text()).toBe('−0,3 kg vs août')
    expect(delta.classes()).toContain('weight-history__delta--down')
  })

  it('écrit ±0,0 kg en gris neutre quand rien ne bouge', async () => {
    entries = [entry(24.5, '2026-08-09'), entry(24.5, '2026-09-13')]
    const wrapper = await monter()
    const delta = wrapper.get('.weight-history__delta')

    expect(delta.text()).toBe('±0,0 kg')
    expect(delta.classes()).toContain('weight-history__delta--flat')
    expect(wrapper.findAll('.weight-history__row-delta')[0]!.classes()).toContain(
      'weight-history__delta--flat',
    )
  })
})

describe('WeightHistoryView — H2 une seule pesée', () => {
  beforeEach(() => {
    entries = [entry(24.5, '2026-11-08')]
  })

  it('date la première pesée et invite à en ajouter une autre à la place de la courbe', async () => {
    const wrapper = await monter()

    const delta = wrapper.get('.weight-history__delta')
    expect(delta.text()).toBe('Première pesée · 8 nov. 2026')
    expect(delta.classes()).toContain('weight-history__delta--flat')
    const single = wrapper.get('.weight-history__single')
    expect(single.text()).toBe('Ajoute une nouvelle pesée pour voir l’évolution.')
    expect(single.find('svg').exists()).toBe(true)
    expect(wrapper.find('.weight-sparkline').exists()).toBe(false)
  })

  it('liste l’unique pesée sans delta, garde le poids à l’arrivée et le bouton fixe', async () => {
    const wrapper = await monter()
    const lignes = wrapper.findAll('.weight-history__row')

    expect(lignes).toHaveLength(1)
    expect(lignes[0]!.get('.weight-history__row-delta').text()).toBe('')
    expect(wrapper.get('.weight-history__initial').text()).toBe('Poids à l’arrivée : 8,5 kg')
    expect(wrapper.find('.weight-history__add').exists()).toBe(true)
  })
})

describe('WeightHistoryView — H3 aucune pesée', () => {
  it('dit « Aucune pesée enregistrée » avec une ligne d’ajout, sans poids actuel ni bouton fixe', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__empty').text()).toBe('Aucune pesée enregistrée')
    expect(wrapper.find('.weight-history__current').exists()).toBe(false)
    expect(wrapper.find('.weight-sparkline').exists()).toBe(false)
    expect(wrapper.find('.weight-history__single').exists()).toBe(false)
    expect(wrapper.find('.weight-history__row').exists()).toBe(false)
    expect(wrapper.find('.weight-history__add').exists()).toBe(false)
  })

  it('garde le poids à l’arrivée', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__initial').text()).toBe('Poids à l’arrivée : 8,5 kg')
  })

  it('ouvre la feuille depuis la ligne d’ajout de la carte vide', async () => {
    const wrapper = await monter()

    const ligne = wrapper.get('.weight-history__empty-add')
    expect(ligne.text()).toBe('Ajouter une pesée')
    await ligne.trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(WeightSheet).props('modelValue')).toBe(true)
  })

  it('n’affiche pas de poids à l’arrivée quand l’animal n’en a pas', async () => {
    animals = [{ ...MILO, initialWeightKg: null }]
    const wrapper = await monter()

    expect(wrapper.find('.weight-history__initial').exists()).toBe(false)
  })
})

describe('WeightHistoryView — chargement', () => {
  it('ne montre ni état vide ni pesées pendant le chargement', async () => {
    listByAnimal.mockReturnValueOnce(new Promise(() => {}))
    const wrapper = await monter()

    expect(wrapper.find('.weight-history__empty').exists()).toBe(false)
    expect(wrapper.find('.weight-history__current').exists()).toBe(false)
    expect(wrapper.find('.weight-history__add').exists()).toBe(false)
  })

  it('dit que les pesées n’ont pas pu être chargées, sans état vide', async () => {
    listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__error').text()).toBe('Impossible de charger les pesées.')
    expect(wrapper.find('.weight-history__empty').exists()).toBe(false)
    expect(wrapper.find('.weight-history__add').exists()).toBe(false)
  })
})

describe('WeightHistoryView — route', () => {
  it('ouvre l’écran depuis l’animal de l’URL, en lui passant l’identifiant en prop', async () => {
    const route = router.resolve(`/animals/${MILO.id}/weight`)

    expect(route.name).toBe('weight-history')
    expect(route.params).toEqual({ animalId: MILO.id })
    expect(route.matched[0]!.props.default).toBe(true)
  })
})
