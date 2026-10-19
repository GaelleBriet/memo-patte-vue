import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { pastDuesAskedAgain } from '../logic/treatment-edition-checks'
import {
  editedFormValues,
  editionDraftOf,
  validateTreatmentEdition,
} from '../logic/treatment-edition-form'
import { formErrorParams, nextDoseShiftHelp } from '../logic/treatment-form-texts'
import type { TreatmentFormValues } from '../logic/treatment-form-values'
import { pastDuesTexts } from '../logic/treatment-past-dues'
import type { PastDuesChoice } from '../schema/treatment-form.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-history.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

type Inputs = {
  values: Ref<TreatmentFormValues>
  treatment: Ref<TreatmentWithPeriods | null>
  today: Readonly<Ref<string>>
  /** Relit la date du jour : la question se repose si ses échéances ont changé depuis (#873). */
  refreshToday?: () => void
}

/**
 * « Modifier » : la prochaine dose proposée et reportée dans la saisie, la question des échéances
 * tombées, puis la modification écrite.
 */
export function useTreatmentEditionForm({ values, treatment, today, refreshToday }: Inputs) {
  const { t } = useI18n()
  const treatments = useTreatmentsStore()

  /** La réponse vaut pour les échéances annoncées au moment où elle a été donnée. */
  const pastDuesAnswer = ref<{ choice: PastDuesChoice; dues: string } | null>(null)
  const isPastDuesOpen = ref(false)

  const draft = computed(() => {
    if (treatment.value === null) return null
    try {
      return editionDraftOf(values.value, treatment.value, today.value)
    } catch {
      return null
    }
  })
  const nextDose = computed(() => draft.value?.nextDose ?? null)
  const nextDoseShift = computed(() =>
    draft.value === null ? null : nextDoseShiftHelp(t, draft.value, values.value),
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
      requireTreatment(),
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

  function requireTreatment(): TreatmentWithPeriods {
    if (treatment.value === null) throw new Error('Formulaire traitement ouvert sans traitement.')
    return treatment.value
  }

  function open(loaded: TreatmentWithPeriods): boolean {
    values.value = editedFormValues(loaded, today.value)
    treatment.value = loaded
    return true
  }

  function answerPastDues(choice: PastDuesChoice): void {
    pastDuesAnswer.value = { choice, dues: announcedDues.value }
  }

  /** Sans écriture possible, ouvre la question des échéances tombées quand c'est elle qui manque. */
  function write(): (() => Promise<unknown>) | null {
    const id = requireTreatment().id
    refreshToday?.()
    const result = validation.validate()
    if (result.success) return () => updated(id, result.data)
    isPastDuesOpen.value = result.needsPastDuesChoice
    return null
  }

  /** La question a changé depuis l'affichage (synchro) : le traitement relu, elle se repose. */
  async function updated(id: string, data: Parameters<typeof treatments.update>[1]) {
    try {
      return await treatments.update(id, data)
    } catch (error) {
      const fresh = pastDuesAskedAgain(error) ? await treatments.getWithPeriods(id) : null
      if (fresh === null) throw error
      treatment.value = fresh
      isPastDuesOpen.value = pastDues.value !== null
      return null
    }
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
