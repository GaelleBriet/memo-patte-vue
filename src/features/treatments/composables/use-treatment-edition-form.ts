import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  editedFormValues,
  editionDraftOf,
  validateTreatmentEdition,
} from '../logic/treatment-edition-form'
import { formErrorParams, nextDoseShiftHelp } from '../logic/treatment-form-texts'
import type { TreatmentFormValues } from '../logic/treatment-form-values'
import { pastDuesTexts } from '../logic/treatment-past-dues'
import type { PastDuesChoice } from '../schema/treatment-form.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

type Inputs = {
  values: Ref<TreatmentFormValues>
  history: Ref<TreatmentWithHistory | null>
  today: Readonly<Ref<string>>
}

/**
 * « Modifier » : la prochaine dose proposée et reportée dans la saisie, la question des échéances
 * tombées, puis la modification écrite.
 */
export function useTreatmentEditionForm({ values, history, today }: Inputs) {
  const { t } = useI18n()
  const treatments = useTreatmentsStore()

  /** La réponse vaut pour les échéances annoncées au moment où elle a été donnée. */
  const pastDuesAnswer = ref<{ choice: PastDuesChoice; dues: string } | null>(null)
  const isPastDuesOpen = ref(false)

  const draft = computed(() => {
    if (history.value === null) return null
    try {
      return editionDraftOf(values.value, history.value, today.value)
    } catch {
      return null
    }
  })
  const nextDose = computed(() => draft.value?.nextDose ?? null)
  const nextDoseShift = computed(() =>
    draft.value === null ? null : nextDoseShiftHelp(t, draft.value, values.value, today.value),
  )
  const announcedDues = computed(() =>
    JSON.stringify([draft.value?.pastDues ?? [], draft.value?.pastDuesNextDose ?? null]),
  )
  const pastDuesChoice = computed(() =>
    pastDuesAnswer.value?.dues === announcedDues.value ? pastDuesAnswer.value.choice : null,
  )
  const pastDues = computed(() => {
    const current = draft.value
    return current === null || current.pastDuesNextDose === null
      ? null
      : pastDuesTexts(t, current.pastDues, current.period, current.pastDuesNextDose)
  })
  const hasSettings = computed(() => draft.value?.change !== 'locked')
  const errorParams = computed(() => formErrorParams(draft.value, null, today.value))
  const validation = useFormValidation(values, (current) =>
    validateTreatmentEdition(
      current,
      requireHistory(),
      today.value,
      pastDuesChoice.value,
      draft.value,
    ),
  )

  watch(
    () => [values.value.frequencyValue, values.value.frequencyUnit, values.value.times],
    () => {
      pastDuesAnswer.value = null
    },
  )

  watch(
    () => nextDose.value?.proposedOn,
    (proposedOn) => {
      values.value.nextDoseOn = proposedOn ?? ''
      values.value.shiftsFollowing = nextDose.value?.shiftInitial ?? true
    },
  )

  function requireHistory(): TreatmentWithHistory {
    if (history.value === null) throw new Error('Formulaire traitement ouvert sans traitement.')
    return history.value
  }

  function open(loaded: TreatmentWithHistory): boolean {
    values.value = editedFormValues(loaded, today.value)
    history.value = loaded
    return true
  }

  function answerPastDues(choice: PastDuesChoice): void {
    pastDuesAnswer.value = { choice, dues: announcedDues.value }
  }

  /** Sans écriture possible, ouvre la question des échéances tombées quand c'est elle qui manque. */
  function write(): (() => Promise<unknown>) | null {
    const id = requireHistory().id
    const result = validation.validate()
    if (result.success) return () => treatments.update(id, result.data)
    isPastDuesOpen.value = result.needsPastDuesChoice
    return null
  }

  return {
    errors: validation.errors,
    errorParams,
    write,
    open,
    nextDose,
    nextDoseShift,
    pastDues,
    isPastDuesOpen,
    answerPastDues,
    hasSettings,
  }
}
