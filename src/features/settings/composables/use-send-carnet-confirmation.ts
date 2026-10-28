import { computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { showToast } from '@/shared/utils/toast'

export function useSendCarnetConfirmation(flow: () => RestoreFlow | null = currentRestoreFlow) {
  const { t } = useI18n()

  const question = computed(() => {
    const state = flow()?.state.value
    return state?.step === 'send-confirmation' ? state : null
  })

  const text = computed(() =>
    question.value === null
      ? ''
      : t(
          'auth.signIn.sendLocal.body',
          { name: question.value.firstName, n: question.value.animalCount },
          question.value.animalCount,
        ),
  )

  const isOpen = computed({
    get: () => question.value !== null,
    set(open) {
      if (!open) void nextTick(cancel)
    },
  })

  function confirm(): void {
    flow()?.confirmSend()
  }

  async function cancel(): Promise<void> {
    const current = flow()
    if (current === null || question.value === null) return
    showToast(t('auth.google.cancelled'))
    await current.cancelSend()
  }

  return { isOpen, text, confirm, cancel }
}
