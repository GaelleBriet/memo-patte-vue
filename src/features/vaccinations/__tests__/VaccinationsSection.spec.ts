import { flushPromises, mount } from '@vue/test-utils'
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

import VaccinationsSection from '../VaccinationsSection.vue'
import type { Vaccination } from '../vaccination.schema'
import type { VaccinationsRepository } from '../vaccinations.repository'
import { provideVaccinationsRepository } from '../vaccinations.store'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'
const TODAY = '2026-09-09'

function vaccination(overrides: Partial<Vaccination> = {}): Vaccination {
  return {
    id: crypto.randomUUID(),
    animalId: MILO,
    name: 'Rage',
    lastInjectionDate: '2025-12-12',
    dueDate: '2026-12-12',
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

let vaccinations: Vaccination[]
let listByAnimal: Mock<VaccinationsRepository['listByAnimal']>
let push: MockInstance

beforeEach(async () => {
  setActivePinia(createPinia())
  vaccinations = []
  listByAnimal = vi.fn<VaccinationsRepository['listByAnimal']>(async (animalId) =>
    vaccinations.filter((item) => item.animalId === animalId),
  )
  provideVaccinationsRepository(() => ({
    listByAnimal,
    getById: vi.fn<VaccinationsRepository['getById']>(),
    create: vi.fn<VaccinationsRepository['create']>(),
    update: vi.fn<VaccinationsRepository['update']>(),
    remove: vi.fn<VaccinationsRepository['remove']>(),
  }))
  await router.push({ name: 'animals' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  provideVaccinationsRepository(null)
  vi.restoreAllMocks()
})

async function monter(animalId = MILO) {
  const wrapper = mount(VaccinationsSection, {
    props: { animalId, today: TODAY },
    global: { plugins: [vuetify, i18n, router] },
  })
  await flushPromises()
  return wrapper
}

function ligne(wrapper: ReturnType<typeof mount>, index: number) {
  const row = wrapper.findAll('.vaccination-row')[index]
  if (!row) throw new Error(`Pas de ligne vaccin à l'index ${index}`)
  return row
}

describe('VaccinationsSection — chargement', () => {
  it('titre la section « Vaccins »', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.section-card__title').text()).toBe('Vaccins')
  })

  it('charge les vaccins de l’animal reçu en prop', async () => {
    await monter()

    expect(listByAnimal).toHaveBeenCalledExactlyOnceWith(MILO)
  })

  it('recharge quand l’animal change', async () => {
    vaccinations = [vaccination({ animalId: LUNA, name: 'Typhus' })]
    const wrapper = await monter()

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(listByAnimal).toHaveBeenLastCalledWith(LUNA)
    expect(ligne(wrapper, 0).get('.vaccination-row__name').text()).toBe('Typhus')
  })
})

describe('VaccinationsSection — lignes et badges', () => {
  it('marque un vaccin en retard : barre corail, « Échéance passée », badge error', async () => {
    vaccinations = [vaccination({ name: 'CHPPi', dueDate: '2026-09-08' })]
    const wrapper = await monter()
    const row = ligne(wrapper, 0)

    expect(row.classes()).toContain('vaccination-row--overdue')
    expect(row.get('.vaccination-row__name').text()).toBe('CHPPi')
    expect(row.get('.vaccination-row__detail').text()).toBe('Échéance passée')
    const badge = row.get('.vaccination-row__badge')
    expect(badge.classes()).toContain('vaccination-row__badge--overdue')
    expect(badge.text()).toBe('En retard')
    expect(badge.find('svg').exists()).toBe(true)
  })

  it('dit « À jour » et la validité en mois/année pour une échéance à venir', async () => {
    vaccinations = [vaccination({ name: 'Rage', dueDate: '2026-12-12' })]
    const wrapper = await monter()
    const row = ligne(wrapper, 0)

    expect(row.classes()).not.toContain('vaccination-row--overdue')
    expect(row.get('.vaccination-row__detail').text()).toBe('Valide jusqu’au 12/2026')
    const badge = row.get('.vaccination-row__badge')
    expect(badge.classes()).toContain('vaccination-row__badge--up-to-date')
    expect(badge.text()).toBe('À jour')
    expect(badge.find('svg').exists()).toBe(true)
  })

  it('reste « À jour » le jour même de l’échéance', async () => {
    vaccinations = [vaccination({ dueDate: TODAY })]
    const wrapper = await monter()

    expect(ligne(wrapper, 0).get('.vaccination-row__badge').text()).toBe('À jour')
  })

  it('affiche « Pas de rappel », neutre et sans icône, quand l’échéance est nulle', async () => {
    vaccinations = [vaccination({ name: 'Leptospirose', dueDate: null })]
    const wrapper = await monter()
    const row = ligne(wrapper, 0)

    expect(row.classes()).not.toContain('vaccination-row--overdue')
    expect(row.get('.vaccination-row__detail').text()).toBe('Pas de rappel programmé')
    const badge = row.get('.vaccination-row__badge')
    expect(badge.classes()).toContain('vaccination-row__badge--none')
    expect(badge.classes()).not.toContain('vaccination-row__badge--up-to-date')
    expect(badge.text()).toBe('Pas de rappel')
    expect(badge.find('svg').exists()).toBe(false)
  })

  it('rend une ligne par vaccin, dans l’ordre du store', async () => {
    vaccinations = [vaccination({ name: 'CHPPi' }), vaccination({ name: 'Rage' })]
    const wrapper = await monter()

    expect(wrapper.findAll('.vaccination-row__name').map((n) => n.text())).toEqual([
      'CHPPi',
      'Rage',
    ])
    expect(wrapper.find('.vaccinations-section__empty').exists()).toBe(false)
  })
})

describe('VaccinationsSection — état vide et ajout', () => {
  it('garde le titre et la ligne d’ajout sans aucun vaccin (C2)', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.vaccinations-section__empty').text()).toBe('Aucun vaccin enregistré')
    expect(wrapper.findAll('.vaccination-row')).toHaveLength(0)
    expect(wrapper.get('.vaccinations-section__add').text()).toBe('Ajouter un vaccin')
  })

  it('place la ligne d’ajout en dernier dans la carte', async () => {
    vaccinations = [vaccination()]
    const wrapper = await monter()
    const card = wrapper.get('.section-card__card')

    expect(card.element.lastElementChild?.classList.contains('vaccinations-section__add')).toBe(
      true,
    )
  })

  it('ouvre le formulaire vaccin de l’animal consulté', async () => {
    const wrapper = await monter()

    await wrapper.get('.vaccinations-section__add').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'vaccination-new', params: { animalId: MILO } })
  })
})

describe('VaccinationsSection — résumé pour le bandeau', () => {
  it('remonte le nombre de rappels et de retards une fois chargé', async () => {
    vaccinations = [
      vaccination({ dueDate: '2026-09-01' }),
      vaccination({ dueDate: '2026-12-12' }),
      vaccination({ dueDate: null }),
    ]
    const wrapper = await monter()

    const summaries = wrapper.emitted('summary') ?? []
    expect(summaries[summaries.length - 1]).toEqual([{ total: 2, overdue: 1 }])
  })
})
