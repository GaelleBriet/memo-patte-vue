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

import WeightHistoryView from '../views/WeightHistoryView.vue'
import WeightSheet from '../views/WeightSheet.vue'
import type { WeightEntry } from '../schema/weight.schema'
import type { WeightRepository } from '../repository/weight.repository'
import { provideWeightRepository, useWeightStore } from '../store/weight.store'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { buildHistoryWeightChart } from '@/shared/domain/weight-chart'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, runToastAction, toastMessage } from '@/shared/utils/toast'

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
let removed: WeightEntry[]
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
  removed = []
  animals = [MILO]
  listByAnimal = vi.fn<WeightRepository['listByAnimal']>(async (animalId) =>
    entries.filter((item) => item.animalId === animalId),
  )
  create = vi.fn<WeightRepository['create']>()
  provideWeightRepository(() => ({
    listByAnimal,
    create,
    update: vi.fn<WeightRepository['update']>(async (id, input) => {
      const updated = { ...entries.find((item) => item.id === id)!, ...input }
      entries = entries
        .map((item) => (item.id === id ? updated : item))
        .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
      return updated
    }),
    remove: vi.fn<WeightRepository['remove']>(async (id) => {
      removed = [...removed, ...entries.filter((item) => item.id === id)]
      entries = entries.filter((item) => item.id !== id)
    }),
    undoRemove: vi.fn<WeightRepository['undoRemove']>(async (id) => {
      entries = [...entries, ...removed.filter((item) => item.id === id)].sort((a, b) =>
        a.measuredOn.localeCompare(b.measuredOn),
      )
    }),
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
  dismissToast()
  provideWeightRepository(null)
  vi.useRealTimers()
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

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Suivi de poids')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Milo')
    expect(wrapper.get('.pushed-screen__subtitle').classes()).toContain(
      'pushed-screen__subtitle--secondary',
    )
  })

  it('s’appuie sur l’écran poussé partagé, bouton d’ajout dans sa barre du bas', async () => {
    entries = [...HISTORIQUE_MILO]
    const wrapper = await monter()

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['pushed-screen', 'weight-history']))
    expect(wrapper.find('.pushed-screen__actions .weight-history__add').exists()).toBe(true)
  })

  it('charge les animaux s’ils ne le sont pas, et les pesées de l’animal de l’URL', async () => {
    await monter()

    expect(loadAnimals).toHaveBeenCalledOnce()
    expect(listByAnimal).toHaveBeenCalledExactlyOnceWith(MILO.id)
  })

  it('borde la top bar dès que le contenu défile', async () => {
    entries = [...HISTORIQUE_MILO]
    const wrapper = await monter()
    const scroll = wrapper.get('.pushed-screen__scroll')
    expect(wrapper.get('.pushed-screen__topbar').classes()).not.toContain(
      'pushed-screen__topbar--scrolled',
    )

    scroll.element.scrollTop = 40
    await scroll.trigger('scroll')

    expect(wrapper.get('.pushed-screen__topbar').classes()).toContain(
      'pushed-screen__topbar--scrolled',
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
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Luna')
    expect(wrapper.get('.weight-history__current').text()).toBe('4,2')
  })

  it('revient au Carnet par la flèche retour', async () => {
    const wrapper = await monter()
    const retour = wrapper.get('.pushed-screen__back')
    expect(retour.attributes('aria-label')).toBe('Retour au carnet')

    await retour.trigger('click')

    expect(push).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
  })
})

function feuille(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('.weight-sheet .bottom-sheet__panel')
  if (!element) throw new Error('Feuille absente du document')
  return element
}

async function saisirPoids(valeur: string) {
  const poids = feuille().querySelector<HTMLInputElement>('#weight-sheet-kg')!
  poids.value = valeur
  poids.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function cliquerDansLaFeuille(selecteur: string) {
  feuille().querySelector<HTMLButtonElement>(selecteur)!.click()
  await flushPromises()
}

async function toucherLigne(index: number) {
  const ligne = wrapper!.findAll<HTMLButtonElement>('.weight-history__row-button')[index]!.element
  ligne.focus()
  ligne.click()
  await flushPromises()
}

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

  it('trace la courbe dans le sens du temps, repères en kg ronds, sans carte « une seule pesée »', async () => {
    const wrapper = await monter()
    const courbe = wrapper.get('.weight-history-chart')

    expect(courbe.findAll('.weight-chart-trace__point')).toHaveLength(6)
    expect(courbe.findAll('.weight-history-chart__tick').map((n) => n.text())).toEqual([
      '23,5',
      '24',
      '24,5',
      '25',
    ])
    expect(courbe.findAll('.weight-chart-trace__month').map((n) => n.text())).toEqual([
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
    expect(wrapper.get('.section-card__counter').text()).toBe('6')
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

    expect(wrapper.get('.weight-history__initial').text()).toBe('Poids à l’arrivée : 8,5 kg')
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

describe('WeightHistoryView — lire une pesée sur la courbe', () => {
  beforeEach(() => {
    entries = [...HISTORIQUE_MILO]
  })

  function courbe() {
    return wrapper!.get('.weight-history-chart__svg')
  }

  function resume() {
    return {
      label: wrapper!.get('.weight-history__current-label').text(),
      poids: wrapper!.get('.weight-history__current').text(),
      unite: wrapper!.get('.weight-history__unit').text(),
      variation: wrapper!.get('.weight-history__delta').text(),
    }
  }

  it('montre dans le résumé la pesée choisie : sa date, son poids, sa variation depuis la précédente', async () => {
    await monter()

    await courbe().trigger('keydown', { key: 'ArrowLeft' })

    expect(resume()).toEqual({
      label: 'Pesée du 11 oct. 2026',
      poids: '24,3',
      unite: 'kg',
      variation: '+0,1 kg',
    })
    expect(wrapper!.get('.weight-history__delta').classes()).toContain('weight-history__delta--up')
  })

  it('montre la pesée touchée sur la courbe', async () => {
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 320,
    } as DOMRect)
    await monter()
    const juillet = buildHistoryWeightChart(HISTORIQUE_MILO)!.points[1]!

    for (const type of ['pointerdown', 'pointerup']) {
      courbe().element.dispatchEvent(
        new MouseEvent(type, { clientX: juillet.x, buttons: 1, bubbles: true }),
      )
    }
    await flushPromises()

    expect(resume()).toMatchObject({ label: 'Pesée du 12 juil. 2026', poids: '23,8' })
    expect(resume().variation).toBe('+0,2 kg')
  })

  it('écrit une baisse en gris chaud', async () => {
    entries = [entry(24.5, '2026-08-09'), entry(24.2, '2026-09-13'), entry(24.4, '2026-10-11')]
    await monter()

    await courbe().trigger('keydown', { key: 'ArrowLeft' })

    expect(resume().variation).toBe('−0,3 kg')
    expect(wrapper!.get('.weight-history__delta').classes()).toContain(
      'weight-history__delta--down',
    )
  })

  it('laisse la variation vide sur la toute première pesée, comme dans la liste', async () => {
    await monter()

    await courbe().trigger('keydown', { key: 'Home' })

    expect(resume()).toEqual({
      label: 'Pesée du 7 juin 2026',
      poids: '23,6',
      unite: 'kg',
      variation: '',
    })
  })

  it('redevient le poids actuel sur la dernière pesée', async () => {
    await monter()

    await courbe().trigger('keydown', { key: 'ArrowLeft' })
    await courbe().trigger('keydown', { key: 'End' })

    expect(resume()).toEqual({
      label: 'Poids actuel',
      poids: '24,5',
      unite: 'kg',
      variation: '+0,2 kg vs octobre',
    })
  })

  it('repart de la dernière pesée à chaque ouverture de l’écran', async () => {
    await monter()
    await courbe().trigger('keydown', { key: 'Home' })
    wrapper!.unmount()

    await monter()

    expect(resume().label).toBe('Poids actuel')
  })

  it('repart de la dernière pesée quand une pesée s’ajoute', async () => {
    create.mockImplementation(async (input) => {
      const created = entry(input.weightKg, input.measuredOn, input.animalId)
      entries = [...entries, created]
      return created
    })
    await monter()
    await courbe().trigger('keydown', { key: 'Home' })

    await useWeightStore().create({ animalId: MILO.id, weightKg: 25, measuredOn: '2026-11-20' })
    await flushPromises()

    expect(resume()).toMatchObject({ label: 'Poids actuel', poids: '25,0' })
  })

  it('annonce le résumé qui suit la pesée lue, poliment', async () => {
    await monter()

    expect(wrapper!.get('.weight-history__reading').attributes('aria-live')).toBe('polite')
  })
})

describe('WeightHistoryView — revenir au poids actuel', () => {
  beforeEach(() => {
    entries = [...HISTORIQUE_MILO]
  })

  function courbe() {
    return wrapper!.get('.weight-history-chart__svg')
  }

  it('n’offre pas la puce au repos, ni sur la pesée la plus récente', async () => {
    await monter()
    expect(wrapper!.find('.weight-history__reset').exists()).toBe(false)

    await courbe().trigger('keydown', { key: 'End' })
    expect(wrapper!.find('.weight-history__reset').exists()).toBe(false)
  })

  it('offre la puce « Poids actuel » à côté d’une autre pesée lue', async () => {
    await monter()

    await courbe().trigger('keydown', { key: 'ArrowLeft' })

    const puce = wrapper!.get('.weight-history__reset')
    expect(puce.text()).toBe('Poids actuel')
    expect(puce.attributes('aria-label')).toBe('Revenir au poids actuel')
  })

  it('revient à la pesée la plus récente par la puce, et rend le focus à la courbe', async () => {
    await monter()
    await courbe().trigger('keydown', { key: 'Home' })

    await wrapper!.get('.weight-history__reset').trigger('click')

    expect(wrapper!.get('.weight-history__current-label').text()).toBe('Poids actuel')
    expect(wrapper!.get('.weight-history__current').text()).toBe('24,5')
    expect(wrapper!.find('.weight-history__reset').exists()).toBe(false)
    expect(wrapper!.find('.weight-history-chart__cursor').exists()).toBe(false)
    expect(document.activeElement).toBe(courbe().element)
  })
})

describe('WeightHistoryView — historique par pages', () => {
  const TRENTE = Array.from({ length: 30 }, (_, index) =>
    entry(
      Math.round((4.2 + index * 0.7) * 10) / 10,
      new Date(Date.UTC(2025, 7, 3) + index * 14 * 86_400_000).toISOString().slice(0, 10),
    ),
  )

  beforeEach(() => {
    entries = [...TRENTE]
  })

  it('ouvre la courbe sur les douze pesées les plus récentes, la liste les garde toutes', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.weight-chart-trace__point')).toHaveLength(12)
    expect(wrapper.get('.weight-history-chart__range').text()).toBe('avr. 2026\u00a0– sept. 2026')
    expect(wrapper.findAll('.weight-history__row')).toHaveLength(30)
    expect(wrapper.get('.section-card__counter').text()).toBe('30')
  })

  it('remet le résumé à la pesée la plus récente en changeant de page', async () => {
    const wrapper = await monter()
    await wrapper.get('.weight-history-chart__svg').trigger('keydown', { key: 'Home' })
    expect(wrapper.get('.weight-history__current-label').text()).toBe('Pesée du 12 avr. 2026')

    await wrapper.get('.weight-history-chart__turn--previous').trigger('click')

    expect(wrapper.get('.weight-history__current-label').text()).toBe('Poids actuel')
    expect(wrapper.get('.weight-history__current').text()).toBe('24,5')
    expect(wrapper.find('.weight-history__reset').exists()).toBe(false)
  })

  it('lit une pesée d’une page plus ancienne dans le résumé', async () => {
    const wrapper = await monter()
    await wrapper.get('.weight-history-chart__turn--previous').trigger('click')

    await wrapper.get('.weight-history-chart__svg').trigger('keydown', { key: 'ArrowLeft' })

    expect(wrapper.get('.weight-history__current-label').text()).toBe('Pesée du 15 mars 2026')
    expect(wrapper.get('.weight-history__current').text()).toBe('15,4')
    expect(wrapper.get('.weight-history__delta').text()).toBe('+0,7 kg')
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
    expect(wrapper.find('.weight-history-chart').exists()).toBe(false)
  })

  it('liste l’unique pesée sans delta, garde le poids à l’arrivée et le bouton fixe', async () => {
    const wrapper = await monter()
    const lignes = wrapper.findAll('.weight-history__row')

    expect(lignes).toHaveLength(1)
    expect(lignes[0]!.get('.weight-history__row-delta').text()).toBe('')
    expect(wrapper.get('.weight-history__initial').text()).toBe('Poids à l’arrivée : 8,5 kg')
    expect(wrapper.find('.weight-history__add').exists()).toBe(true)
  })
})

describe('WeightHistoryView — H3 aucune pesée', () => {
  it('dit « Aucune pesée enregistrée » avec une ligne d’ajout, sans poids actuel ni bouton fixe', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__empty').text()).toBe('Aucune pesée enregistrée')
    expect(wrapper.find('.weight-history__current').exists()).toBe(false)
    expect(wrapper.find('.weight-history-chart').exists()).toBe(false)
    expect(wrapper.find('.weight-history__single').exists()).toBe(false)
    expect(wrapper.find('.weight-history__row').exists()).toBe(false)
    expect(wrapper.find('.weight-history__add').exists()).toBe(false)
  })

  it('garde le poids à l’arrivée', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__initial').text()).toBe('Poids à l’arrivée : 8,5 kg')
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

describe('WeightHistoryView — retour du focus', () => {
  it('rend le focus au bouton fixe quand la première pesée remplace la carte vide', async () => {
    create.mockImplementationOnce(async (input) => {
      const created = entry(input.weightKg, input.measuredOn)
      entries = [created]
      return created
    })
    const wrapper = await monter()
    const ligne = wrapper.get<HTMLButtonElement>('.weight-history__empty-add').element
    ligne.focus()
    ligne.click()
    await flushPromises()

    const feuille = document.body.querySelector<HTMLElement>('.weight-sheet')
    const poids = feuille?.querySelector<HTMLInputElement>('#weight-sheet-kg')
    if (!poids) throw new Error('Champ poids absent')
    poids.value = '24,5'
    poids.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    feuille?.querySelector<HTMLButtonElement>('.weight-sheet__submit')?.click()
    await flushPromises()

    expect(wrapper.find('.weight-history__empty-add').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.weight-history__add').element)
  })
})

describe('WeightHistoryView — chargement', () => {
  it('montre un indicateur de chargement, ni état vide ni pesées', async () => {
    listByAnimal.mockReturnValueOnce(new Promise(() => {}))
    const wrapper = await monter()

    expect(wrapper.find('.weight-history__loading .v-progress-circular').exists()).toBe(true)
    expect(wrapper.find('.weight-history__empty').exists()).toBe(false)
    expect(wrapper.find('.weight-history__current').exists()).toBe(false)
    expect(wrapper.find('.weight-history__add').exists()).toBe(false)
  })

  it('dit que les pesées n’ont pas pu être chargées, sans état vide ni indicateur', async () => {
    listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__error-text').text()).toBe(
      'Impossible de charger les pesées.',
    )
    expect(wrapper.find('.weight-history__loading').exists()).toBe(false)
    expect(wrapper.find('.weight-history__empty').exists()).toBe(false)
    expect(wrapper.find('.weight-history__add').exists()).toBe(false)
  })

  it('réessaie le chargement depuis le message d’échec', async () => {
    entries = [...HISTORIQUE_MILO]
    listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()

    const bouton = wrapper.get('.weight-history__retry')
    expect(bouton.text()).toBe('Réessayer')
    await bouton.trigger('click')
    await flushPromises()

    expect(listByAnimal).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.weight-history__error').exists()).toBe(false)
    expect(wrapper.findAll('.weight-history__row')).toHaveLength(6)
  })
})

describe('WeightHistoryView — animal introuvable', () => {
  it('le dit, sans poids, liste, ligne d’ajout ni bouton fixe', async () => {
    animals = []
    entries = [...HISTORIQUE_MILO]
    const wrapper = await monter()

    expect(wrapper.get('.weight-history__not-found').text()).toBe('Cet animal est introuvable.')
    expect(wrapper.get('.pushed-screen__title').text()).toBe('Suivi de poids')
    expect(wrapper.find('.pushed-screen__subtitle').exists()).toBe(false)
    expect(wrapper.find('.weight-history__current').exists()).toBe(false)
    expect(wrapper.find('.weight-history__row').exists()).toBe(false)
    expect(wrapper.find('.weight-history__empty-add').exists()).toBe(false)
    expect(wrapper.find('.weight-history__add').exists()).toBe(false)
    expect(wrapper.find('.weight-history__initial').exists()).toBe(false)
  })

  it('attend la liste des animaux avant de conclure', async () => {
    loadAnimals.mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = await monter()

    expect(wrapper.find('.weight-history__not-found').exists()).toBe(false)
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

describe('WeightHistoryView — corriger ou supprimer une pesée', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 10, 0))
    entries = [...HISTORIQUE_MILO]
  })

  function lignes() {
    return wrapper!.findAll('.weight-history__row').map((ligne) => ({
      date: ligne.get('.weight-history__row-date').text(),
      poids: ligne.get('.weight-history__row-value').text(),
    }))
  }

  it('fait de chaque ligne un bouton nommé par son contenu, variation comprise', async () => {
    const wrapper = await monter()

    const boutons = wrapper.findAll('.weight-history__row .weight-history__row-button')
    expect(boutons).toHaveLength(6)
    expect(boutons[0]!.element.tagName).toBe('BUTTON')
    expect(boutons[0]!.attributes('aria-label')).toBeUndefined()
    expect(boutons[0]!.findAll('span').map((partie) => partie.text())).toEqual([
      '8 nov. 2026',
      '+0,2 kg',
      '24,5 kg',
    ])
  })

  it('décrit ce que permet chaque ligne : modifier ou supprimer', async () => {
    const wrapper = await monter()

    for (const bouton of wrapper.findAll('.weight-history__row-button')) {
      const description = document.getElementById(bouton.attributes('aria-describedby') ?? '')
      expect(description?.textContent?.trim()).toBe('Modifier ou supprimer')
    }
  })

  it('ouvre la feuille pesée de la ligne touchée, pré-remplie', async () => {
    const wrapper = await monter()

    await toucherLigne(1)

    const sheet = wrapper.getComponent(WeightSheet)
    expect(sheet.props('modelValue')).toBe(true)
    expect(sheet.props('entry')).toEqual(HISTORIQUE_MILO[4])
    expect(feuille().querySelector('.bottom-sheet__title')?.textContent).toBe('Modifier la pesée')
    expect(feuille().querySelector<HTMLInputElement>('#weight-sheet-kg')?.value).toBe('24,3')
    expect(feuille().querySelector<HTMLInputElement>('#weight-sheet-date')?.value).toBe(
      '2026-10-11',
    )
  })

  it('rouvre la feuille en ajout par le bouton fixe, après une ligne', async () => {
    const wrapper = await monter()
    await toucherLigne(1)
    await wrapper.getComponent(WeightSheet).setValue(false, 'modelValue')

    await wrapper.get('.weight-history__add').trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(WeightSheet).props('entry')).toBeNull()
    expect(feuille().querySelector('.bottom-sheet__title')?.textContent).toBe('Ajouter une pesée')
  })

  it('corrige la pesée : liste, poids actuel, variation et courbe suivent aussitôt', async () => {
    const wrapper = await monter()
    await toucherLigne(0)

    await saisirPoids('24,8')
    await cliquerDansLaFeuille('.weight-sheet__submit')

    expect(wrapper.getComponent(WeightSheet).props('modelValue')).toBe(false)
    expect(lignes()[0]).toEqual({ date: '8 nov. 2026', poids: '24,8 kg' })
    expect(wrapper.get('.weight-history__current').text()).toBe('24,8')
    expect(wrapper.get('.weight-history__delta').text()).toContain('+0,5 kg')
    expect(wrapper.findAll('.weight-history-chart__tick').map((n) => n.text())).toContain('25')
  })

  it('supprime la pesée sans dialogue : la ligne part, le résumé suit, un toast le confirme', async () => {
    const wrapper = await monter()
    await toucherLigne(0)

    await cliquerDansLaFeuille('.weight-sheet__delete')

    expect(lignes().map((ligne) => ligne.date)).not.toContain('8 nov. 2026')
    expect(wrapper.get('.section-card__counter').text()).toBe('5')
    expect(wrapper.get('.weight-history__current').text()).toBe('24,3')
    expect(wrapper.findAll('.weight-chart-trace__point')).toHaveLength(5)
    expect(toastMessage.value).toBe('Pesée du 8 nov. supprimée')
  })

  it('remet la pesée supprimée par « Annuler »', async () => {
    const wrapper = await monter()
    await toucherLigne(2)
    await cliquerDansLaFeuille('.weight-sheet__delete')
    expect(wrapper.findAll('.weight-history__row')).toHaveLength(5)

    runToastAction()
    await flushPromises()

    expect(lignes()[2]).toEqual({ date: '13 sept. 2026', poids: '24,2 kg' })
    expect(wrapper.get('.section-card__counter').text()).toBe('6')
  })

  it('rend le focus à la ligne remise par « Annuler »', async () => {
    const wrapper = await monter()
    await toucherLigne(2)
    await cliquerDansLaFeuille('.weight-sheet__delete')

    runToastAction()
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.findAll('.weight-history__row-button')[2]!.element)
  })

  it('rend le focus au bouton fixe quand la ligne supprimée a disparu', async () => {
    const wrapper = await monter()
    await toucherLigne(0)

    await cliquerDansLaFeuille('.weight-sheet__delete')

    expect(document.activeElement).toBe(wrapper.get('.weight-history__add').element)
  })

  it('rend le focus à la ligne d’ajout quand la dernière pesée est supprimée', async () => {
    entries = [entry(24.5, '2026-11-08')]
    const wrapper = await monter()
    await toucherLigne(0)

    await cliquerDansLaFeuille('.weight-sheet__delete')

    expect(wrapper.find('.weight-history__add').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.weight-history__empty-add').element)
  })
})

describe('WeightHistoryView — page de la courbe après une écriture', () => {
  const TRENTE = Array.from({ length: 30 }, (_, index) =>
    entry(
      Math.round((4.2 + index * 0.7) * 10) / 10,
      new Date(Date.UTC(2025, 7, 3) + index * 14 * 86_400_000).toISOString().slice(0, 10),
    ),
  )

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 25, 10, 0))
    entries = [...TRENTE]
  })

  function periode() {
    return wrapper!.get('.weight-history-chart__range').text()
  }

  it('garde la page de la courbe quand une pesée est supprimée puis remise', async () => {
    const wrapper = await monter()
    await wrapper.get('.weight-history-chart__turn--previous').trigger('click')
    expect(periode()).toBe('oct. 2025\u00a0– mars 2026')

    await toucherLigne(0)
    await cliquerDansLaFeuille('.weight-sheet__delete')
    expect(periode()).toBe('oct. 2025\u00a0– mars 2026')

    runToastAction()
    await flushPromises()
    expect(periode()).toBe('oct. 2025\u00a0– mars 2026')
  })

  it('garde la page de la courbe quand une pesée est corrigée', async () => {
    const wrapper = await monter()
    await wrapper.get('.weight-history-chart__turn--previous').trigger('click')

    await toucherLigne(0)
    await saisirPoids('24,6')
    await cliquerDansLaFeuille('.weight-sheet__submit')

    expect(periode()).toBe('oct. 2025\u00a0– mars 2026')
  })

  it('montre la page la plus récente après un ajout', async () => {
    create.mockImplementation(async (input) => {
      const created = entry(input.weightKg, input.measuredOn, input.animalId)
      entries = [...entries, created]
      return created
    })
    const wrapper = await monter()
    await wrapper.get('.weight-history-chart__turn--previous').trigger('click')

    await wrapper.get('.weight-history__add').trigger('click')
    await flushPromises()
    await saisirPoids('24,6')
    await cliquerDansLaFeuille('.weight-sheet__submit')

    expect(periode()).toBe('avr. 2026\u00a0– sept. 2026')
    expect(wrapper.get('.weight-history-chart__turn--next').attributes('aria-disabled')).toBe(
      'true',
    )
  })
})
