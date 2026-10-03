import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import TreatmentsSection from '../views/TreatmentsSection.vue'
import type {
  TreatmentsRepository,
  TreatmentWithHistory,
} from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { provideTreatmentsRepository } from '../store/treatments.store'
import { fakeTreatmentsRepository } from './fake-treatments-repository'
import { dose, period } from './treatment-fixtures'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'
const TODAY = '2026-09-09'
const NBSP = /\u00a0/g

type Overrides = Partial<Pick<TreatmentWithHistory, 'animalId' | 'name' | 'type'>> & {
  period?: Partial<TreatmentPeriodRecord>
  doses?: NewTreatmentDose[]
}

/** Trimestriel sans prise, première dose le 24 sept. : à venir le 9 sept. */
function treatment({
  animalId = MILO,
  name = 'Bravecto',
  type = 'antiparasitic',
  period: settings = {},
  doses = [],
}: Overrides = {}): TreatmentWithHistory {
  const id = crypto.randomUUID()
  return {
    id,
    animalId,
    name,
    type,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    periods: [
      period({
        id: 'p-1',
        treatmentId: id,
        animalId,
        frequency: { value: 3, unit: 'month' },
        startsOn: '2026-09-24',
        firstDueOn: '2026-09-24',
        ...settings,
      }),
    ],
    doses: doses.map((line) => ({ ...line, treatmentId: id, animalId })),
  }
}

function firstDue(firstDueOn: string): Overrides {
  return { period: { startsOn: firstDueOn, firstDueOn } }
}

const QUOTIDIEN = {
  frequency: { value: 1, unit: 'day' },
  startsOn: '2026-09-01',
  firstDueOn: '2026-09-01',
} as const
const DEUX_PRISES = [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')]

let treatments: TreatmentWithHistory[]
let list: Mock<TreatmentsRepository['listWithHistoryByAnimal']>

beforeEach(async () => {
  setActivePinia(createPinia())
  treatments = []
  list = vi.fn<TreatmentsRepository['listWithHistoryByAnimal']>(async (animalId) =>
    treatments.filter((item) => item.animalId === animalId),
  )
  const repository = fakeTreatmentsRepository({ listWithHistoryByAnimal: list })
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

function texte(element: { text(): string }): string {
  return element.text().replace(NBSP, ' ')
}

function resume(wrapper: ReturnType<typeof mount>) {
  return (wrapper.emitted('summary') ?? []).at(-1)
}

describe('TreatmentsSection — chargement', () => {
  it('titre la section « Traitements en cours »', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.section-card__title').text()).toBe('Traitements en cours')
  })

  it('charge les traitements de l’animal reçu en prop et recharge quand il change', async () => {
    treatments = [treatment({ animalId: LUNA, name: 'Milbemax' })]
    const wrapper = await monter()
    expect(list).toHaveBeenCalledExactlyOnceWith(MILO)

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(list).toHaveBeenLastCalledWith(LUNA)
    expect(ligne(wrapper).get('.treatment-row__name').text()).toBe('Milbemax')
  })
  it('n’affiche pas la liste de l’animal précédent pendant le chargement du suivant', async () => {
    treatments = [treatment()]
    const wrapper = await monter()
    list.mockReturnValueOnce(new Promise(() => {}))

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
      treatment({ period: { frequency: { value: 4, unit: 'week' } } }),
      treatment({ period: { frequency: { value: 15, unit: 'day' } } }),
      treatment({ period: { frequency: { value: 1, unit: 'month' } } }),
      treatment({ period: { frequency: { value: 1, unit: 'day' } } }),
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
    treatments = [treatment()]
    const wrapper = await monter()
    const nextDose = ligne(wrapper).get('.treatment-row__next-dose')

    expect(texte(nextDose)).toBe('Prochaine dose · 24 sept.')
    expect(nextDose.classes()).toContain('treatment-row__next-dose--later')
    expect(nextDose.classes()).not.toContain('treatment-row__next-dose--today')
    expect(nextDose.classes()).not.toContain('treatment-row__next-dose--overdue')
  })

  it('annonce la prochaine dose demain', async () => {
    treatments = [treatment(firstDue('2026-09-10'))]
    const wrapper = await monter()

    expect(texte(ligne(wrapper).get('.treatment-row__next-dose'))).toBe(
      'Prochaine dose · demain, 10 sept.',
    )
  })

  it('passe en ambre le jour même', async () => {
    treatments = [treatment(firstDue(TODAY))]
    const wrapper = await monter()
    const nextDose = ligne(wrapper).get('.treatment-row__next-dose')

    expect(texte(nextDose)).toBe('Dose du jour · 9 sept.')
    expect(nextDose.classes()).toContain('treatment-row__next-dose--today')
  })

  it('passe en corail quand la dose du moment est en retard', async () => {
    treatments = [treatment(firstDue('2026-09-07'))]
    const wrapper = await monter()
    const nextDose = ligne(wrapper).get('.treatment-row__next-dose')

    expect(texte(nextDose)).toBe('En retard depuis le 7 sept.')
    expect(nextDose.classes()).toContain('treatment-row__next-dose--overdue')
    expect(ligne(wrapper).find('.treatment-row__unlogged').exists()).toBe(false)
  })

  it('ajoute les doses non renseignées sous la ligne, sans rouge (TR-14, TR-36)', async () => {
    treatments = [treatment({ name: 'Panacur', period: QUOTIDIEN, doses: DEUX_PRISES })]
    const wrapper = await monter()
    const row = ligne(wrapper)

    expect(texte(row.get('.treatment-row__next-dose'))).toBe('Dose du jour · 9 sept.')
    expect(row.get('.treatment-row__next-dose').classes()).not.toContain(
      'treatment-row__next-dose--overdue',
    )
    expect(texte(row.get('.treatment-row__unlogged'))).toBe('6 doses non renseignées')
    expect(row.get('.treatment-row__frequency').text()).toBe('Tous les jours')
    expect(resume(wrapper)).toEqual([{ total: 1, overdue: 0, ongoing: 1 }])
  })

  it('garde en cours un traitement arrêté qui a des doses à renseigner, badge « À renseigner »', async () => {
    treatments = [
      treatment({
        name: 'Panacur',
        period: { ...QUOTIDIEN, stoppedOn: '2026-09-06' },
        doses: DEUX_PRISES,
      }),
    ]
    const wrapper = await monter()
    const row = ligne(wrapper)

    expect(row.get('.treatment-row__frequency').text()).toBe('À renseigner')
    expect(row.get('.treatment-row__frequency').classes()).toContain('due-status-chip--none')
    expect(texte(row.get('.treatment-row__next-dose'))).toBe('Arrêté le 6 sept.')
    expect(texte(row.get('.treatment-row__unlogged'))).toBe('3 doses non renseignées')
    expect(wrapper.find('.finished-treatments').exists()).toBe(false)
    expect(resume(wrapper)).toEqual([{ total: 0, overdue: 0, ongoing: 1 }])
  })

  it('garde une ligne sobre, qui mène à la fiche, pour un traitement illisible', async () => {
    const illisible = treatment({ name: 'Abîmé', period: { times: ['8h'] } })
    treatments = [illisible, treatment()]
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    const wrapper = await monter()
    const row = ligne(wrapper, 1)

    expect(row.get('.treatment-row__name').text()).toBe('Abîmé')
    expect(row.get('.treatment-row__next-dose').text()).toBe('Donnée illisible')
    expect(row.find('.treatment-row__frequency').exists()).toBe(false)
    await row.trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'treatment-detail', params: { id: illisible.id } })
    expect(resume(wrapper)).toEqual([{ total: 1, overdue: 0, ongoing: 2 }])
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
    list.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()
    expect(wrapper.find('.treatments-section__error').exists()).toBe(true)
    list.mockReturnValueOnce(new Promise(() => {}))

    await wrapper.setProps({ animalId: LUNA })
    await flushPromises()

    expect(wrapper.find('.treatments-section__error').exists()).toBe(false)
  })

  it('dit que les traitements n’ont pas pu être chargés, sans état vide, résumé à zéro', async () => {
    list.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter()

    expect(wrapper.get('.treatments-section__error').text()).toBe(
      'Impossible de charger les traitements.',
    )
    expect(wrapper.find('.treatments-section__empty').exists()).toBe(false)
    expect(wrapper.findAll('.treatment-row')).toHaveLength(0)
    expect(resume(wrapper)).toEqual([{ total: 0, overdue: 0, ongoing: 0 }])
  })
})

describe('TreatmentsSection — résumé pour le bandeau', () => {
  it('remonte les rappels, les retards et le nombre en cours', async () => {
    treatments = [treatment(firstDue('2026-09-01')), treatment()]
    const wrapper = await monter()

    expect(resume(wrapper)).toEqual([{ total: 2, overdue: 1, ongoing: 2 }])
  })

  it('laisse un traitement terminé hors des traitements en cours, du bandeau et des retards', async () => {
    treatments = [
      treatment({
        name: 'Milbemax',
        period: { ...firstDue('2026-09-07').period, stoppedOn: '2026-09-05' },
      }),
      treatment(),
    ]
    const wrapper = await monter()

    expect(
      wrapper.findAll('.treatment-row').map((row) => row.get('.treatment-row__name').text()),
    ).toEqual(['Bravecto'])
    expect(resume(wrapper)).toEqual([{ total: 1, overdue: 0, ongoing: 1 }])
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
  /** Deux prises trimestrielles, arrêté avant la troisième : plus rien à renseigner. */
  const ARRETE: Overrides = {
    period: { startsOn: '2025-12-01', firstDueOn: '2025-12-01', stoppedOn: '2026-05-26' },
    doses: [dose('2025-12-01', '2026-03-01'), dose('2026-03-01', '2026-06-01')],
  }

  function terminés(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.finished-treatment-row')
  }

  it('y range un traitement dont la date de fin est passée, tout renseigné', async () => {
    treatments = [
      treatment({
        name: 'Métacam',
        period: { ...QUOTIDIEN, endsOn: '2026-09-02' },
        doses: DEUX_PRISES,
      }),
    ]
    const wrapper = await monter()
    await wrapper.get('.finished-treatments__toggle').trigger('click')

    expect(wrapper.findAll('.treatment-row')).toHaveLength(0)
    expect(terminés(wrapper).map(texte)).toEqual(['MétacamTerminé le 2 sept. · 2 prises'])
  })

  it('replie par défaut les traitements terminés, avec leur nombre', async () => {
    treatments = [treatment({ name: 'Milbemax', ...ARRETE }), treatment()]
    const wrapper = await monter()

    const bouton = wrapper.get('.finished-treatments__toggle')
    expect(bouton.text()).toContain('Traitements terminés')
    expect(bouton.get('.finished-treatments__counter').text()).toBe('1')
    expect(bouton.attributes('aria-expanded')).toBe('false')
    expect(terminés(wrapper)).toHaveLength(0)
  })

  it('déplie : date d’arrêt et nombre de prises, ligne qui ouvre le détail (F9 ter)', async () => {
    const milbemax = treatment({ name: 'Milbemax', ...ARRETE })
    treatments = [milbemax]
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    const wrapper = await monter()

    await wrapper.get('.finished-treatments__toggle').trigger('click')

    expect(wrapper.get('.finished-treatments__toggle').attributes('aria-expanded')).toBe('true')
    expect(terminés(wrapper).map(texte)).toEqual(['MilbemaxArrêté le 26 mai · 2 prises'])
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
      treatment({ name: 'Milbemax', ...ARRETE }),
      treatment({ animalId: LUNA, name: 'Drontal', ...ARRETE }),
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
