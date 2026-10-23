import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'

import { isPasswordConfirmed, PASSWORDS_DIFFER_KEY } from '../logic/new-password-confirmation'

/** L'écart entre les deux saisies se montre une fois la confirmation quittée, ou après un envoi refusé. */
export function usePasswordConfirmation(
  password: MaybeRefOrGetter<string>,
  confirmation: MaybeRefOrGetter<string>,
  submittedError: MaybeRefOrGetter<string | null | undefined>,
) {
  const hasLeft = ref(false)

  const isConfirmed = computed(() => isPasswordConfirmed(toValue(password), toValue(confirmation)))
  const error = computed(
    () =>
      toValue(submittedError) ??
      (hasLeft.value && !isConfirmed.value ? PASSWORDS_DIFFER_KEY : null),
  )

  function leave(): void {
    hasLeft.value = true
  }

  function reset(): void {
    hasLeft.value = false
  }

  return { isConfirmed, error, leave, reset }
}
