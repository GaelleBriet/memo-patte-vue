import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DayChoice } from '../logic/treatment-choose-days'
import {
  creationPastDuesOf,
  pastDosesBasis,
  validateTreatmentCreation,
} from '../logic/treatment-creation-form'
import { formErrorParams } from '../logic/treatment-form-texts'
import type { TreatmentFormValues } from '../logic/treatment-form-values'
import {
  pastDosesOf,
  pastDosesPrompt,
  pastDosesResult,
  promptChoice,
  type PromptActionId,
} from '../logic/treatment-unlogged'
import { useTreatmentsStore } from '../store/treatments.store'
import { hasSeveralDoseTimes } from '@/shared/domain/treatment-periods'
import { useFormValidation } from '@/shared/form/use-form-validation'

type Inputs = {
  values: Ref<TreatmentFormValues>
  today: Readonly<Ref<string>>
  animalId: () => string | undefined
  targetAnimal: Readonly<Ref<{ unfollowedOn: string | null } | null>>
}

/** « Créer » : l'encart des doses déjà passées, puis le traitement écrit avec sa réponse. */
export function useTreatmentCreationForm({ values, today, animalId, targetAnimal }: Inputs) {
  const { t } = useI18n()
  const treatments = useTreatmentsStore()

  /** Réponse de l'encart des doses passées : rien n'est écrit avant « Créer ». */
  const pastDosesAnswer = ref<DayChoice | null>(null)
  const isChooseDaysOpen = ref(false)
  const validation = useFormValidation(values, (current) =>
    validateTreatmentCreation(
      current,
      requireAnimalId(),
      today.value,
      pastDosesAnswer.value === null ? null : pastDosesOf(pastDosesAnswer.value),
    ),
  )

  const pastDoses = computed(() =>
    pastDosesPrompt(
      t,
      creationPastDuesOf(values.value, today.value),
      today.value,
      hasSeveralDoseTimes(values.value.times),
      { followed: (targetAnimal.value?.unfollowedOn ?? null) === null },
    ),
  )
  const pastDosesAnswered = computed(() =>
    pastDosesAnswer.value === null ? null : pastDosesResult(t, pastDosesAnswer.value),
  )
  const errorParams = computed(() => formErrorParams(null, null, today.value))

  watch(
    () => pastDosesBasis(values.value, pastDoses.value?.dues ?? []),
    () => {
      pastDosesAnswer.value = null
    },
  )

  function requireAnimalId(): string {
    const id = animalId()
    if (id === undefined) throw new Error('Formulaire traitement ouvert sans animal.')
    return id
  }

  function actOnPastDoses(action: PromptActionId): void {
    if (pastDoses.value === null) return
    if (action === 'choose-days') isChooseDaysOpen.value = true
    else pastDosesAnswer.value = promptChoice(action, pastDoses.value.dues)
  }

  function answerPastDoses(choice: DayChoice): void {
    pastDosesAnswer.value = choice
    isChooseDaysOpen.value = false
  }

  function write(): (() => Promise<unknown>) | null {
    const result = validation.validate()
    return result.success ? () => treatments.create(result.data) : null
  }

  return {
    errors: validation.errors,
    errorParams,
    write,
    pastDoses,
    pastDosesAnswer,
    pastDosesAnswered,
    isChooseDaysOpen,
    actOnPastDoses,
    answerPastDoses,
  }
}
