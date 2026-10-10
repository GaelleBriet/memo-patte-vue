import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'

import { MILO, saisie, TODAY } from './treatment-form-fixtures'
import { useTreatmentCreationForm } from '../composables/use-treatment-creation-form'
import type { TreatmentFormValues } from '../logic/treatment-form-values'
import type { Treatment } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import i18n from '@/core/i18n'

/** Quotidien depuis le 25 sept., sans heure : trois échéances déjà passées le 28. */
const passee = () => saisie({ firstDoseOn: '2026-09-25', times: [], endsOn: '' })

let create: MockInstance<ReturnType<typeof useTreatmentsStore>['create']>

beforeEach(() => {
  setActivePinia(createPinia())
  create = vi.spyOn(useTreatmentsStore(), 'create').mockResolvedValue({} as Treatment)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function creation(
  initial: TreatmentFormValues = passee(),
  animalId: () => string | undefined = () => MILO,
) {
  const values = ref(initial)
  let form: ReturnType<typeof useTreatmentCreationForm> | undefined
  mount(
    defineComponent({
      setup() {
        form = useTreatmentCreationForm({
          values,
          today: ref(TODAY),
          animalId,
          targetAnimal: ref({ unfollowedOn: null }),
        })
        return () => null
      },
    }),
    { global: { plugins: [i18n] } },
  )
  return { values, form: form! }
}

describe('useTreatmentCreationForm — encart des doses passées (TR-3)', () => {
  it('annonce les échéances passées de la saisie, et rien pour un traitement qui commence', () => {
    expect(creation().form.pastDoses.value?.dues).toHaveLength(3)
    expect(creation(saisie()).form.pastDoses.value).toBeNull()
  })

  it('prend la réponse d’un geste de l’encart sans rien écrire', () => {
    const { form } = creation()

    form.actOnPastDoses('all-given')

    expect(form.pastDosesAnswer.value?.given).toHaveLength(3)
    expect(form.pastDosesAnswered.value).not.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('ouvre « Choisir les jours », puis le ferme sur la réponse', () => {
    const { form } = creation()

    form.actOnPastDoses('choose-days')
    expect(form.isChooseDaysOpen.value).toBe(true)

    form.answerPastDoses({ given: [], missed: form.pastDoses.value!.dues })
    expect(form.isChooseDaysOpen.value).toBe(false)
    expect(form.pastDosesAnswer.value?.missed).toHaveLength(3)
  })

  it('oublie la réponse quand la première prise, le rythme ou la date de fin changent', async () => {
    const { values, form } = creation()
    form.actOnPastDoses('missed')

    values.value.name = 'Autre nom'
    await nextTick()
    expect(form.pastDosesAnswer.value).not.toBeNull()

    values.value.frequencyValue = '2'
    await nextTick()
    expect(form.pastDosesAnswer.value).toBeNull()
  })
})

describe('useTreatmentCreationForm — « Créer »', () => {
  it('n’écrit rien d’une saisie invalide et montre ses erreurs', () => {
    const { form } = creation(saisie({ name: '' }))

    expect(form.write()).toBeNull()
    expect(form.errors.value).toEqual({ name: 'treatments.form.errors.name' })
  })

  it('crée le traitement avec les doses renseignées dans l’encart', async () => {
    const { form } = creation()
    form.actOnPastDoses('all-given')

    await form.write()?.()

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        animalId: MILO,
        firstDoseOn: '2026-09-25',
        pastDoses: [
          { dueOn: '2026-09-25', dueTime: null, status: 'given' },
          { dueOn: '2026-09-26', dueTime: null, status: 'given' },
          { dueOn: '2026-09-27', dueTime: null, status: 'given' },
        ],
      }),
    )
  })

  it('lève sans animal dans la route', () => {
    expect(() => creation(passee(), () => undefined).form.write()).toThrow(
      'Formulaire traitement ouvert sans animal.',
    )
  })
})
