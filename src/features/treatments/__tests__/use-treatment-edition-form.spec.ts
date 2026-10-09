import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'

import { milbemax, period, TODAY } from './treatment-form-fixtures'
import { useTreatmentEditionForm } from '../composables/use-treatment-edition-form'
import { emptyTreatmentFormValues } from '../logic/treatment-form-values'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { Treatment } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import i18n from '@/core/i18n'

/** Tous les deux jours depuis le 23 sept., aucune prise : des échéances tombées le 28. */
const SANS_PRISE = () =>
  milbemax(
    [
      period({
        startsOn: '2026-09-22',
        firstDueOn: '2026-09-23',
        frequency: { value: 2, unit: 'day' },
      }),
    ],
    [],
  )

let update: MockInstance<ReturnType<typeof useTreatmentsStore>['update']>

beforeEach(() => {
  setActivePinia(createPinia())
  update = vi.spyOn(useTreatmentsStore(), 'update').mockResolvedValue({} as Treatment)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function modification(loaded: TreatmentWithHistory = milbemax()) {
  const values = ref(emptyTreatmentFormValues())
  const history = ref<TreatmentWithHistory | null>(null)
  let form: ReturnType<typeof useTreatmentEditionForm> | undefined
  mount(
    defineComponent({
      setup() {
        form = useTreatmentEditionForm({ values, history, today: ref(TODAY) })
        return () => null
      },
    }),
    { global: { plugins: [i18n] } },
  )
  form!.open(loaded)
  return { values, history, form: form! }
}

describe('useTreatmentEditionForm — prochaine dose', () => {
  it('ouvre sur les réglages en cours et la prochaine dose proposée', () => {
    const { values, history, form } = modification()

    expect(history.value?.id).toBe(milbemax().id)
    expect(values.value).toMatchObject({ name: 'Milbemax', nextDoseOn: '2026-10-10' })
    expect(form.nextDose.value).toMatchObject({ proposedOn: '2026-10-10' })
    expect(form.hasSettings.value).toBe(true)
  })

  it('reporte dans la saisie la date que propose un nouveau rythme', async () => {
    const { values, form } = modification()

    values.value.frequencyValue = '1'
    await nextTick()

    expect(form.nextDose.value?.proposedOn).toBe(TODAY)
    expect(values.value.nextDoseOn).toBe(TODAY)
  })

  it('verrouille les réglages d’un traitement fini', () => {
    const { form } = modification(milbemax([period({ endsOn: '2026-08-01' })]))

    expect(form.nextDose.value).toBeNull()
    expect(form.hasSettings.value).toBe(false)
  })

  it('sans brouillon lisible, ne propose rien et lève à l’enregistrement', () => {
    const values = ref(emptyTreatmentFormValues())
    const history = ref<TreatmentWithHistory | null>(milbemax([period({ times: ['8h'] })]))
    let form: ReturnType<typeof useTreatmentEditionForm> | undefined
    mount(
      defineComponent({
        setup() {
          form = useTreatmentEditionForm({ values, history, today: ref(TODAY) })
          return () => null
        },
      }),
      { global: { plugins: [i18n] } },
    )

    expect(form!.nextDose.value).toBeNull()
    expect(() => form!.write()).toThrow(RangeError)
  })
})

describe('useTreatmentEditionForm — échéances tombées', () => {
  async function aDemander() {
    const edited = modification(SANS_PRISE())
    edited.values.value.frequencyValue = '3'
    await nextTick()
    return edited
  }

  it('pose la question au lieu d’écrire quand c’est elle qui manque', async () => {
    const { form } = await aDemander()

    expect(form.write()).toBeNull()
    expect(form.isPastDuesOpen.value).toBe(true)
    expect(form.pastDues.value).not.toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('écrit la modification avec la réponse donnée', async () => {
    const { form } = await aDemander()
    form.answerPastDues('keep')

    await form.write()?.()

    expect(update).toHaveBeenCalledWith(
      SANS_PRISE().id,
      expect.objectContaining({ pastDues: 'keep', nextDoseOn: TODAY }),
    )
  })

  it('oublie la réponse quand la fréquence change de nouveau', async () => {
    const { values, form } = await aDemander()
    form.answerPastDues('drop')

    values.value.frequencyValue = '4'
    await nextTick()

    expect(form.write()).toBeNull()
    expect(form.isPastDuesOpen.value).toBe(true)
  })

  it('ne pose pas la question d’une saisie invalide, et montre ses erreurs', async () => {
    const { values, form } = await aDemander()
    values.value.name = ''

    expect(form.write()).toBeNull()
    expect(form.isPastDuesOpen.value).toBe(false)
    expect(form.errors.value).toEqual({ name: 'treatments.form.errors.name' })
  })
})
