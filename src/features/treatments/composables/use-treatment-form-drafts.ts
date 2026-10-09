import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { editionDraftOf } from '../logic/treatment-edition-form'
import type { TreatmentFormValues } from '../logic/treatment-form-values'
import { nextDoseShiftHelp } from '../logic/treatment-form-texts'
import { pastDuesTexts } from '../logic/treatment-past-dues'
import type { PastDuesChoice } from '../schema/treatment-form.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

type Inputs = {
  values: Ref<TreatmentFormValues>
  history: Ref<TreatmentWithHistory | null>
  today: Ref<string>
}

/**
 * Ce que « Modifier » et « Reprendre » calculent de la saisie, et ce qu'ils y reportent : la
 * prochaine dose proposée, la date de fin qui reprend la durée précédente.
 */
export function useTreatmentFormDrafts(
  mode: 'create' | 'edit' | 'resume',
  { values, history, today }: Inputs,
) {
  const { t } = useI18n()
  /** La réponse vaut pour les échéances annoncées au moment où elle a été donnée. */
  const pastDuesAnswer = ref<{ choice: PastDuesChoice; dues: string } | null>(null)

  const draft = computed(() => {
    if (mode !== 'edit' || history.value === null) return null
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

  function answerPastDues(choice: PastDuesChoice): void {
    pastDuesAnswer.value = { choice, dues: announcedDues.value }
  }

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

  return {
    draft,
    nextDose,
    nextDoseShift,
    pastDuesChoice,
    pastDues,
    hasSettings,
    answerPastDues,
  }
}
