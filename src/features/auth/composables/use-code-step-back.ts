import { onScopeDispose, watch, type Ref } from 'vue'

import { onBackButton } from '@/core/app-lifecycle/back-button'

/** Le retour d'Android fait, à l'étape du code, comme la flèche de l'écran. */
export function useCodeStepBack(
  isCodeStep: Readonly<Ref<boolean>>,
  backToAddress: () => void,
): void {
  let release: (() => void) | null = null

  function hold(): void {
    release?.()
    release = null
    if (isCodeStep.value) release = onBackButton(backToAddress)
  }

  watch(isCodeStep, hold, { immediate: true, flush: 'sync' })
  onScopeDispose(() => release?.())
}
