import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { milbemax, period, TODAY } from './treatment-form-fixtures'
import { useTreatmentResumptionForm } from '../composables/use-treatment-resumption-form'
import { emptyTreatmentFormValues } from '../logic/treatment-form-values'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { Treatment } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { plain } from '@/shared/__tests__/plain'

/** Arrêté le 1er août, fini le 10 : 32 jours depuis la première prise du 10 juillet. */
const ARRETE = () => milbemax([period({ stoppedOn: '2026-08-01', endsOn: '2026-08-10' })])

const Vide = { render: () => null }

let router: Router
let resume: MockInstance<ReturnType<typeof useTreatmentsStore>['resume']>

beforeEach(async () => {
  setActivePinia(createPinia())
  resume = vi.spyOn(useTreatmentsStore(), 'resume').mockResolvedValue({} as Treatment)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/animals', name: 'carnet', component: Vide },
      { path: '/treatments/:id', name: 'treatment-detail', component: Vide },
    ],
  })
  await router.push('/animals')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function reprise() {
  const values = ref(emptyTreatmentFormValues())
  const history = ref<TreatmentWithHistory | null>(null)
  const endsOnTouched = ref(false)
  let form: ReturnType<typeof useTreatmentResumptionForm> | undefined
  mount(
    defineComponent({
      setup() {
        form = useTreatmentResumptionForm({ values, history, today: ref(TODAY), endsOnTouched })
        return () => null
      },
    }),
    { global: { plugins: [router] } },
  )
  return { values, history, endsOnTouched, form: form! }
}

describe('useTreatmentResumptionForm — ouverture', () => {
  it('part des réglages de la dernière période, sans date de fin ni première prise', () => {
    const { values, history, form } = reprise()

    expect(form.open(ARRETE())).toBe(true)
    expect(history.value?.id).toBe(ARRETE().id)
    expect(values.value).toMatchObject({ name: 'Milbemax', firstDoseOn: '', endsOn: '' })
    expect(form.previous.value).toMatchObject({ startedOn: '2026-07-10', endedOn: '2026-08-01' })
  })

  it('revient à la fiche d’un traitement en cours, qui n’a rien à reprendre', async () => {
    const select = vi.spyOn(useAnimalsStore(), 'select')
    const { history, form } = reprise()

    expect(form.open(milbemax())).toBe(false)
    await flushPromises()

    expect(history.value).toBeNull()
    expect(select).toHaveBeenCalledWith(milbemax().animalId)
    expect(router.currentRoute.value.name).toBe('treatment-detail')
  })
})

describe('useTreatmentResumptionForm — saisie', () => {
  it('reprend la durée précédente pour la date de fin, tant qu’elle n’est pas touchée', async () => {
    const { values, endsOnTouched, form } = reprise()
    form.open(ARRETE())

    values.value.firstDoseOn = '2026-10-01'
    await nextTick()
    expect(values.value.endsOn).toBe('2026-11-01')

    endsOnTouched.value = true
    values.value.firstDoseOn = '2026-10-05'
    await nextTick()
    expect(values.value.endsOn).toBe('2026-11-01')
  })

  it('ne s’enregistre qu’avec une première prise', () => {
    const { values, form } = reprise()
    form.open(ARRETE())

    expect(form.canSave.value).toBe(false)
    values.value.firstDoseOn = '2026-10-01'
    expect(form.canSave.value).toBe(true)
  })

  it('refuse une première prise avant la fin de la dernière période, sans rien écrire', () => {
    const { values, form } = reprise()
    form.open(ARRETE())
    values.value.firstDoseOn = '2026-07-31'

    expect(form.write()).toBeNull()
    expect(form.errors.value).toEqual({
      firstDoseOn: 'treatments.form.errors.firstDoseOnTooEarly',
    })
    expect(plain(String(form.errorParams.value.from))).toBe('1er août')
  })

  it('reprend le traitement ouvert avec la saisie validée', async () => {
    const { values, form } = reprise()
    form.open(ARRETE())
    values.value.firstDoseOn = '2026-10-01'

    await form.write()?.()

    expect(resume).toHaveBeenCalledWith(
      ARRETE().id,
      expect.objectContaining({
        firstDoseOn: '2026-10-01',
        frequency: { value: 3, unit: 'month' },
      }),
    )
  })
})
