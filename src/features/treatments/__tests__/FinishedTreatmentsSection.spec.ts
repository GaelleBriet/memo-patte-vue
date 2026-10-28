import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import FinishedTreatmentsSection from '../views/FinishedTreatmentsSection.vue'
import TreatmentsSection from '../views/TreatmentsSection.vue'
import ListRowIcon from '@/shared/components/ListRowIcon.vue'
import type { FinishedTreatmentRow } from '../logic/treatment-carnet'
import type { TreatmentsRepository } from '../repository/treatments.repository'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
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

type Overrides = Partial<Pick<TreatmentWithPeriods, 'animalId' | 'name' | 'type'>> & {
  period?: Partial<TreatmentPeriodRecord>
  doses?: TreatmentDose[]
}

/** Trimestriel sans prise, première dose le 24 sept. : à venir le 9 sept. */
function treatment({
  animalId = MILO,
  name = 'Bravecto',
  type = 'antiparasitic',
  period: settings = {},
  doses = [],
}: Overrides = {}): TreatmentWithPeriods {
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

const QUOTIDIEN = {
  frequency: { value: 1, unit: 'day' },
  startsOn: '2026-09-01',
  firstDueOn: '2026-09-01',
} as const
const DEUX_PRISES = [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')]

let treatments: TreatmentWithPeriods[]

beforeEach(async () => {
  setActivePinia(createPinia())
  treatments = []
  const list = vi.fn<TreatmentsRepository['listWithPeriodsByAnimal']>(async (animalId) =>
    treatments.filter((item) => item.animalId === animalId),
  )
  const repository = fakeTreatmentsRepository({ listWithPeriodsByAnimal: list })
  provideTreatmentsRepository(() => repository)
  await router.push({ name: 'carnet' })
})

afterEach(() => {
  provideTreatmentsRepository(null)
  vi.restoreAllMocks()
})

const Ensemble = defineComponent({
  components: { FinishedTreatmentsSection, TreatmentsSection },
  props: { animalId: { type: String, required: true } },
  setup() {
    const rows = ref<FinishedTreatmentRow[]>([])
    return { rows, today: TODAY }
  },
  template: `
    <TreatmentsSection :animal-id="animalId" :today="today" @finished="rows = $event" />
    <FinishedTreatmentsSection :animal-id="animalId" :rows="rows" />
  `,
})

async function monter(animalId = MILO) {
  const wrapper = mount(Ensemble, {
    props: { animalId },
    global: { plugins: [vuetify, i18n, router] },
  })
  await flushPromises()
  return wrapper
}

function texte(element: { text(): string }): string {
  return element.text().replaceAll(NBSP, ' ')
}

function pastille(row: {
  findAllComponents: ReturnType<typeof mount>['findAllComponents']
  element: Element
}) {
  const pastilles = row.findAllComponents(ListRowIcon)
  expect(pastilles).toHaveLength(1)
  expect(pastilles[0]!.attributes('aria-hidden')).toBe('true')
  expect(row.element.firstElementChild).toBe(pastilles[0]!.element)
  return pastilles[0]!.props()
}

describe('FinishedTreatmentsSection (F9)', () => {
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

describe('FinishedTreatmentsSection — pastille d’icône (B · V15)', () => {
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
