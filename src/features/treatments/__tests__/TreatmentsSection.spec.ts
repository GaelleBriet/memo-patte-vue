import { flushPromises, mount, type DOMWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import TreatmentsSection from '../views/TreatmentsSection.vue'
import ListRowIcon from '@/shared/components/ListRowIcon.vue'
import type { TreatmentsRepository } from '../repository/treatments.repository'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
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
  await router.push({ name: 'carnet' })
})

afterEach(() => {
  provideTreatmentsRepository(null)
  vi.restoreAllMocks()
})

async function monter(animalId = MILO, followed = true) {
  const wrapper = mount(TreatmentsSection, {
    props: { animalId, today: TODAY, followed },
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
  return element.text().replaceAll(NBSP, ' ')
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

describe('TreatmentsSection — lignes (B · V15)', () => {
  it('affiche le nom, le rythme et la prochaine dose, sans type ni badge quand rien n’est en retard', async () => {
    treatments = [treatment()]
    const wrapper = await monter()
    const row = ligne(wrapper)

    expect(row.get('.treatment-row__name').text()).toBe('Bravecto')
    expect(texte(row.get('.treatment-row__detail'))).toBe(
      'Tous les 3 mois · prochaine dose le 24 sept.',
    )
    expect(row.find('.treatment-row__type').exists()).toBe(false)
    expect(row.find('.treatment-row__badge').exists()).toBe(false)
  })

  it('accorde le rythme selon l’unité et le nombre', async () => {
    treatments = [
      treatment({ period: { frequency: { value: 4, unit: 'week' } } }),
      treatment({ period: { frequency: { value: 15, unit: 'day' } } }),
      treatment({ period: { frequency: { value: 1, unit: 'month' } } }),
    ]
    const wrapper = await monter()

    expect(wrapper.findAll('.treatment-row__detail').map(texte)).toEqual([
      'Toutes les 4 semaines · prochaine dose le 24 sept.',
      'Tous les 15 jours · prochaine dose le 24 sept.',
      'Tous les mois · prochaine dose le 24 sept.',
    ])
  })

  it('donne les heures avec le rythme : « Tous les jours à 8 h et 20 h »', async () => {
    treatments = [treatment({ period: { ...QUOTIDIEN, times: ['08:00', '20:00'] } })]
    const wrapper = await monter()

    expect(texte(ligne(wrapper).get('.treatment-row__detail'))).toBe(
      'Tous les jours à 8 h et 20 h · prochaine dose le 9 sept.',
    )
  })

  it('donne la période d’un traitement qui a une date de fin : « du 1er au 15 sept. »', async () => {
    treatments = [treatment({ period: { ...QUOTIDIEN, endsOn: '2026-09-15' }, doses: DEUX_PRISES })]
    const wrapper = await monter()

    expect(texte(ligne(wrapper).get('.treatment-row__detail'))).toBe(
      'Tous les jours · du 1er au 15 sept.',
    )
  })

  it('en retard, le rythme seul', async () => {
    treatments = [treatment(firstDue('2026-09-07'))]
    const wrapper = await monter()

    expect(texte(ligne(wrapper).get('.treatment-row__detail'))).toBe('Tous les 3 mois')
  })

  it('le jour même, ni badge ni couleur', async () => {
    treatments = [treatment(firstDue(TODAY))]
    const wrapper = await monter()

    expect(ligne(wrapper).find('.treatment-row__badge').exists()).toBe(false)
  })

  it('en retard : badge « En retard · N j » en corail, avec son icône', async () => {
    treatments = [treatment(firstDue('2026-09-07'))]
    const wrapper = await monter()
    const badge = ligne(wrapper).get('.treatment-row__badge')

    expect(badge.text()).toBe('En retard · 2 j')
    expect(badge.classes()).toContain('due-status-chip--overdue')
    expect(badge.find('svg').exists()).toBe(true)
    expect(ligne(wrapper).find('.treatment-row__unlogged').exists()).toBe(false)
  })

  it('ajoute les doses non renseignées sous la ligne, sans rouge ni badge (TR-14, TR-36)', async () => {
    treatments = [treatment({ name: 'Panacur', period: QUOTIDIEN, doses: DEUX_PRISES })]
    const wrapper = await monter()
    const row = ligne(wrapper)

    expect(texte(row.get('.treatment-row__detail'))).toBe(
      'Tous les jours · prochaine dose le 9 sept.',
    )
    expect(texte(row.get('.treatment-row__unlogged'))).toBe('6 doses non renseignées')
    expect(row.find('.treatment-row__badge').exists()).toBe(false)
    expect(resume(wrapper)).toEqual([{ total: 1, overdue: 0, ongoing: 1 }])
  })

  it('garde en cours un traitement arrêté qui a des doses à renseigner, badge « À renseigner » turquoise', async () => {
    treatments = [
      treatment({
        name: 'Panacur',
        period: { ...QUOTIDIEN, stoppedOn: '2026-09-06' },
        doses: DEUX_PRISES,
      }),
    ]
    const wrapper = await monter()
    const row = ligne(wrapper)
    const badge = row.get('.treatment-row__badge')

    expect(badge.text()).toBe('À renseigner')
    expect(badge.classes()).toContain('due-status-chip--to-log')
    expect(badge.find('svg').exists()).toBe(false)
    expect(texte(row.get('.treatment-row__detail'))).toBe('Arrêté le 6 sept.')
    expect(texte(row.get('.treatment-row__unlogged'))).toBe('3 doses non renseignées')
    expect(wrapper.find('.finished-treatments').exists()).toBe(false)
    expect(resume(wrapper)).toEqual([{ total: 0, overdue: 0, ongoing: 1 }])
  })

  it('TR-37 : range dans « Traitements terminés » l’arrêté d’un animal qu’on ne suit plus, sans « À renseigner »', async () => {
    treatments = [
      treatment({
        name: 'Panacur',
        period: { ...QUOTIDIEN, stoppedOn: '2026-09-06' },
        doses: DEUX_PRISES,
      }),
    ]
    const wrapper = await monter(MILO, false)

    expect(wrapper.find('.treatment-row__badge').exists()).toBe(false)
    expect(wrapper.find('.finished-treatments').exists()).toBe(true)
    expect(resume(wrapper)).toEqual([{ total: 0, overdue: 0, ongoing: 0 }])
  })

  it('garde une ligne sobre, qui mène à la fiche, pour un traitement illisible', async () => {
    const illisible = treatment({ name: 'Abîmé', period: { times: ['8h'] } })
    treatments = [illisible, treatment()]
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    const wrapper = await monter()
    const row = ligne(wrapper, 1)

    expect(row.get('.treatment-row__name').text()).toBe('Abîmé')
    expect(row.get('.treatment-row__detail').text()).toBe('Donnée illisible')
    expect(row.find('.treatment-row__badge').exists()).toBe(false)
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

  it('AN-9 : ne propose plus « Ajouter un traitement » pour un animal qu’on ne suit plus', async () => {
    const wrapper = await monter(MILO, false)

    expect(wrapper.get('.treatments-section__empty').text()).toBe('Aucun traitement en cours')
    expect(wrapper.find('.section-card__add').exists()).toBe(false)
  })
})

describe('TreatmentsSection — pastille d’icône (B · V15)', () => {
  function pastille(row: DOMWrapper<Element>) {
    const pastilles = row.findAllComponents(ListRowIcon)
    expect(pastilles).toHaveLength(1)
    expect(pastilles[0]!.attributes('aria-hidden')).toBe('true')
    expect(row.element.firstElementChild).toBe(pastilles[0]!.element)
    return pastilles[0]!.props()
  }

  it('ouvre chaque ligne en cours par l’icône de son type', async () => {
    treatments = [
      treatment({ name: 'Bravecto', type: 'antiparasitic', ...firstDue('2026-09-20') }),
      treatment({ name: 'Milbemax', type: 'deworming', ...firstDue('2026-09-21') }),
      treatment({ name: 'Métacam', type: 'medication', ...firstDue('2026-09-22') }),
    ]
    const wrapper = await monter()

    expect([0, 1, 2].map((index) => pastille(ligne(wrapper, index)))).toEqual([
      { icon: 'ms:pest_control', muted: false },
      { icon: 'ms:medication', muted: false },
      { icon: 'ms:medication', muted: false },
    ])
    expect(texte(ligne(wrapper, 0))).toMatch(/^Bravecto/)
  })

  it('ouvre une ligne terminée par une pastille grise', async () => {
    treatments = [
      treatment({
        name: 'Advocate',
        period: { startsOn: '2025-12-01', firstDueOn: '2025-12-01', stoppedOn: '2026-05-26' },
        doses: [dose('2025-12-01', '2026-03-01'), dose('2026-03-01', '2026-06-01')],
      }),
    ]
    const wrapper = await monter()
    await wrapper.get('.finished-treatments__toggle').trigger('click')

    const [row] = wrapper.findAll('.finished-treatment-row')
    expect(pastille(row!)).toEqual({
      icon: 'ms:pest_control',
      muted: true,
    })
    expect(texte(row!)).toBe('AdvocateArrêté le 26 mai · 2 prises')
  })
})
