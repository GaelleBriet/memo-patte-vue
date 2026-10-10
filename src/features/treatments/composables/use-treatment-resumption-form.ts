import { computed, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { formErrorParams } from '../logic/treatment-form-texts'
import type { TreatmentFormValues } from '../logic/treatment-form-values'
import { resumptionDraft } from '../logic/treatment-resumption'
import {
  canSubmitResumption,
  resumedFormValues,
  validateTreatmentResumption,
} from '../logic/treatment-resumption-form'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { detailRoute } from '@/shared/domain/reminder-route'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { returnTo } from '@/shared/utils/return-to'

type Inputs = {
  values: Ref<TreatmentFormValues>
  history: Ref<TreatmentWithHistory | null>
  today: Readonly<Ref<string>>
  endsOnTouched: Readonly<Ref<boolean>>
}

/** « Reprendre » : une nouvelle période, sa date de fin qui reprend la durée de la précédente. */
export function useTreatmentResumptionForm({ values, history, today, endsOnTouched }: Inputs) {
  const router = useRouter()
  const animals = useAnimalsStore()
  const treatments = useTreatmentsStore()

  const validation = useFormValidation(values, (current) =>
    validateTreatmentResumption(current, requireHistory(), today.value),
  )

  const previous = computed(() =>
    history.value === null ? null : resumptionDraft(history.value, today.value),
  )
  const canSave = computed(() => canSubmitResumption(values.value))
  const errorParams = computed(() => formErrorParams(null, previous.value, today.value))

  watch(
    () => values.value.firstDoseOn,
    (firstDoseOn) => {
      if (previous.value === null || endsOnTouched.value) return
      values.value.endsOn = previous.value.endsOnFor(firstDoseOn) ?? ''
    },
  )

  function requireHistory(): TreatmentWithHistory {
    if (history.value === null) throw new Error('Formulaire traitement ouvert sans traitement.')
    return history.value
  }

  /** Faux quand le traitement n'a rien à reprendre : retour à sa fiche. */
  function open(loaded: TreatmentWithHistory): boolean {
    const opened = resumedFormValues(loaded, today.value)
    if (opened.status === 'not-resumable') {
      animals.select(loaded.animalId)
      returnTo(router, detailRoute({ kind: 'treatment', id: loaded.id }))
      return false
    }
    values.value = opened.values
    history.value = loaded
    return true
  }

  function write(): (() => Promise<unknown>) | null {
    const id = requireHistory().id
    const result = validation.validate()
    return result.success ? () => treatments.resume(id, result.data) : null
  }

  return { errors: validation.errors, errorParams, canSave, write, previous, open }
}
