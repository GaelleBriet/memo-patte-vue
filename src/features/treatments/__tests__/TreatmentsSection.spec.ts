import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import TreatmentsSection from '../TreatmentsSection.vue'
import type { Treatment } from '../treatment.schema'
import type { TreatmentsRepository } from '../treatments.repository'
import { provideTreatmentsRepository } from '../treatments.store'
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
  provideTreatmentsRepository(() => ({
    listByAnimal,
    getById: vi.fn<TreatmentsRepository['getById']>(),
    create: vi.fn<TreatmentsRepository['create']>(),
    update: vi.fn<TreatmentsRepository['update']>(),
    remove: vi.fn<TreatmentsRepository['remove']>(),
  }))
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

  it('n’offre pas encore de ligne d’ajout : le formulaire traitement n’existe pas', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.treatments-section__add').exists()).toBe(false)
  })
})

describe('TreatmentsSection — chargement en échec', () => {
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
})
