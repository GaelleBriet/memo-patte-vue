import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import TreatmentsSection from '../views/TreatmentsSection.vue'
import type { Treatment } from '../schema/treatment.schema'
import type { TreatmentsRepository } from '../repository/treatments.repository'
import { provideTreatmentsRepository } from '../store/treatments.store'
import { fakeTreatmentsRepository } from './fake-treatments-repository'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'
const TODAY = '2026-09-09'

function treatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: crypto.randomUUID(),
    animalId: MILO,
    name: 'Bravecto',
    type: 'antiparasitic',
    frequency: { value: 3, unit: 'month' },
    lastDoseDate: '2026-06-24',
    nextDueDate: '2026-09-24',
    stoppedOn: null,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

let treatments: Treatment[]
let listByAnimal: Mock<TreatmentsRepository['listByAnimal']>

beforeEach(async () => {
  setActivePinia(createPinia())
  treatments = []
  listByAnimal = vi.fn<TreatmentsRepository['listByAnimal']>(async (animalId) =>
    treatments.filter((item) => item.animalId === animalId),
  )
  const repository = fakeTreatmentsRepository({ listByAnimal })
  provideTreatmentsRepository(() => repository)
  await router.push({ name: 'animals' })
})

afterEach(() => {
  provideTreatmentsRepository(null)
  vi.restoreAllMocks()
})

async function monter(animalId = MILO) {
  const wrapper = mount(TreatmentsSection, {
    props: { animalId, today: TODAY },
    global: { plugins: [vuetify, i18n, router] },
  })
  await flushPromises()
  return wrapper
}

function ligne(wrapper: ReturnType<typeof mount>, index = 0) {
  const row = wrapper.findAll('.treatment-row')[index]
  if (!row) throw new Error(`Pas de ligne traitement à l'index ${index}`)
  return row
}

describe('TreatmentsSection — chargement', () => {
  it('titre la section « Traitements en cours »', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.section-card__title').text()).toBe('Traitements en cours')
  })

  it('charge les traitements de l’animal reçu en prop et recharge quand il change', async () => {
    treatments = [treatment({ animalId: LUNA, name: 'Milbemax' })]
    const wrapper = await monter()
    expect(listByAnimal).toHaveBeenCalledExactlyOnceWith(MILO)

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(listByAnimal).toHaveBeenLastCalledWith(LUNA)
    expect(ligne(wrapper).get('.treatment-row__name').text()).toBe('Milbemax')
  })
  it('n’affiche pas la liste de l’animal précédent pendant le chargement du suivant', async () => {
    treatments = [treatment()]
    const wrapper = await monter()
    listByAnimal.mockReturnValueOnce(new Promise(() => {}))

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(wrapper.findAll('.treatment-row')).toHaveLength(0)
  })
})

describe('TreatmentsSection — lignes', () => {
  it('affiche nom, type et badge de fréquence neutre', async () => {
    treatments = [treatment()]
    const wrapper = await monter()
    const row = ligne(wrapper)

    expect(row.get('.treatment-row__name').text()).toBe('Bravecto')
    expect(row.get('.treatment-row__type').text()).toBe('Antiparasitaire')
    expect(row.get('.treatment-row__frequency').text()).toBe('Tous les 3 mois')
    expect(row.get('.treatment-row__frequency').classes()).toEqual(
      expect.arrayContaining(['due-status-chip', 'due-status-chip--none']),
    )
  })

  it('traduit le type vermifuge', async () => {
    treatments = [treatment({ name: 'Milbemax', type: 'deworming' })]
    const wrapper = await monter()

    expect(ligne(wrapper).get('.treatment-row__type').text()).toBe('Vermifuge')
  })

  it('accorde la fréquence selon l’unité et le nombre', async () => {
    treatments = [
      treatment({ frequency: { value: 4, unit: 'week' } }),
      treatment({ frequency: { value: 15, unit: 'day' } }),
      treatment({ frequency: { value: 1, unit: 'month' } }),
      treatment({ frequency: { value: 1, unit: 'day' } }),
    ]
    const wrapper = await monter()

    expect(wrapper.findAll('.treatment-row__frequency').map((n) => n.text())).toEqual([
      'Toutes les 4 semaines',
      'Tous les 15 jours',
      'Tous les mois',
      'Tous les jours',
    ])
  })

  it('annonce la prochaine dose en gris quand elle est loin', async () => {
    treatments = [treatment({ nextDueDate: '2026-09-24' })]
    const wrapper = await monter()
    const nextDose = ligne(wrapper).get('.treatment-row__next-dose')

    expect(nextDose.text()).toBe('Prochaine dose dans 15 jours')
    expect(nextDose.classes()).toContain('treatment-row__next-dose--later')
    expect(nextDose.classes()).not.toContain('treatment-row__next-dose--today')
    expect(nextDose.classes()).not.toContain('treatment-row__next-dose--overdue')
  })

  it('annonce la prochaine dose demain', async () => {
    treatments = [treatment({ nextDueDate: '2026-09-10' })]
    const wrapper = await monter()

    expect(ligne(wrapper).get('.treatment-row__next-dose').text()).toBe('Prochaine dose demain')
  })

  it('passe en ambre le jour même', async () => {
    treatments = [treatment({ nextDueDate: TODAY })]
    const wrapper = await monter()
    const nextDose = ligne(wrapper).get('.treatment-row__next-dose')

    expect(nextDose.text()).toBe('Prochaine dose aujourd’hui')
    expect(nextDose.classes()).toContain('treatment-row__next-dose--today')
  })

  it('passe en corail avec le nombre de jours de retard', async () => {
    treatments = [treatment({ nextDueDate: '2026-09-07' })]
    const wrapper = await monter()
    const nextDose = ligne(wrapper).get('.treatment-row__next-dose')

    expect(nextDose.text()).toBe('Prochaine dose en retard · 2 j')
    expect(nextDose.classes()).toContain('treatment-row__next-dose--overdue')
  })
})

describe('TreatmentsSection — état vide', () => {
  it('garde le titre et dit « Aucun traitement en cours » (C2)', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.treatments-section__empty').text()).toBe('Aucun traitement en cours')
    expect(wrapper.findAll('.treatment-row')).toHaveLength(0)
  })
})

describe('TreatmentsSection — chargement en échec', () => {
  it('n’affiche pas l’erreur de l’animal précédent pendant le chargement du suivant', async () => {
    listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()
    expect(wrapper.find('.treatments-section__error').exists()).toBe(true)
    listByAnimal.mockReturnValueOnce(new Promise(() => {}))

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(wrapper.find('.treatments-section__error').exists()).toBe(false)
  })

  it('dit que les traitements n’ont pas pu être chargés, sans état vide, résumé à zéro', async () => {
    listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()

    expect(wrapper.get('.treatments-section__error').text()).toBe(
      'Impossible de charger les traitements.',
    )
    expect(wrapper.find('.treatments-section__empty').exists()).toBe(false)
    expect(wrapper.findAll('.treatment-row')).toHaveLength(0)
    const summaries = wrapper.emitted('summary') ?? []
    expect(summaries[summaries.length - 1]).toEqual([{ total: 0, overdue: 0, ongoing: 0 }])
  })
})

describe('TreatmentsSection — résumé pour le bandeau', () => {
  it('remonte les rappels, les retards et le nombre en cours', async () => {
    treatments = [
      treatment({ nextDueDate: '2026-09-01' }),
      treatment({ nextDueDate: '2026-09-24' }),
    ]
    const wrapper = await monter()

    const summaries = wrapper.emitted('summary') ?? []
    expect(summaries[summaries.length - 1]).toEqual([{ total: 2, overdue: 1, ongoing: 2 }])
  })

  it('laisse un traitement arrêté hors des traitements en cours, du bandeau et des retards', async () => {
    treatments = [
      treatment({ name: 'Milbemax', nextDueDate: '2026-09-01', stoppedOn: '2026-09-05' }),
      treatment({ nextDueDate: '2026-09-24' }),
    ]
    const wrapper = await monter()

    expect(
      wrapper.findAll('.treatment-row').map((row) => row.get('.treatment-row__name').text()),
    ).toEqual(['Bravecto'])
    const summaries = wrapper.emitted('summary') ?? []
    expect(summaries[summaries.length - 1]).toEqual([{ total: 1, overdue: 0, ongoing: 1 }])
  })
})

describe('TreatmentsSection — détail', () => {
  it('ouvre le détail d’un traitement en cours au toucher de sa ligne (F8)', async () => {
    const bravecto = treatment()
    treatments = [bravecto]
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    const wrapper = await monter()

    expect(ligne(wrapper).element.tagName).toBe('BUTTON')
    await ligne(wrapper).trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'treatment-detail', params: { id: bravecto.id } })
  })
})

describe('TreatmentsSection — traitements terminés (F9)', () => {
  function terminés(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.finished-treatment-row')
  }

  it('replie par défaut les traitements terminés, avec leur nombre', async () => {
    treatments = [treatment({ name: 'Milbemax', stoppedOn: '2026-05-26' }), treatment()]
    const wrapper = await monter()

    const bouton = wrapper.get('.finished-treatments__toggle')
    expect(bouton.text()).toContain('Traitements terminés')
    expect(bouton.get('.finished-treatments__counter').text()).toBe('1')
    expect(bouton.attributes('aria-expanded')).toBe('false')
    expect(terminés(wrapper)).toHaveLength(0)
  })

  it('déplie : date d’arrêt et nombre de prises, ligne qui ouvre le détail (F9 ter)', async () => {
    const milbemax = treatment({ name: 'Milbemax', stoppedOn: '2026-05-26' })
    treatments = [milbemax]
    const repository = fakeTreatmentsRepository({
      listByAnimal,
      countDosesByAnimal: async () => ({ [milbemax.id]: 2 }),
    })
    provideTreatmentsRepository(() => repository)
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    const wrapper = await monter()

    await wrapper.get('.finished-treatments__toggle').trigger('click')

    expect(wrapper.get('.finished-treatments__toggle').attributes('aria-expanded')).toBe('true')
    expect(terminés(wrapper).map((row) => row.text())).toEqual([
      'MilbemaxArrêté le 26 mai 2026 · 2 prises',
    ])
    await terminés(wrapper)[0]!.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'treatment-detail', params: { id: milbemax.id } })
  })

  it('n’affiche pas la partie sans traitement terminé', async () => {
    treatments = [treatment()]
    const wrapper = await monter()

    expect(wrapper.find('.finished-treatments').exists()).toBe(false)
  })

  it('replie de nouveau la partie quand l’animal change', async () => {
    treatments = [
      treatment({ name: 'Milbemax', stoppedOn: '2026-05-26' }),
      treatment({ animalId: LUNA, name: 'Drontal', stoppedOn: '2026-05-26' }),
    ]
    const wrapper = await monter()
    await wrapper.get('.finished-treatments__toggle').trigger('click')

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(wrapper.get('.finished-treatments__toggle').attributes('aria-expanded')).toBe('false')
  })
})

describe('TreatmentsSection — ajout', () => {
  it('termine la carte par « Ajouter un traitement », même sans traitement', async () => {
    const wrapper = await monter()

    const ajout = wrapper.get('.section-card__add')
    expect(ajout.text()).toBe('Ajouter un traitement')
    expect(ajout.element.tagName).toBe('BUTTON')
  })

  it('ouvre le formulaire de création pour l’animal affiché', async () => {
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    const wrapper = await monter()

    await wrapper.get('.section-card__add').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'treatment-new', params: { animalId: MILO } })
  })
})
