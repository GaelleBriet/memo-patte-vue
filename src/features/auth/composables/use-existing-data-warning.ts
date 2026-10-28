import { ref } from 'vue'

import { mustWarnBeforeSignIn } from '../logic/existing-data-warning'
import { useAuthStore } from '../store/auth.store'
import { useAnimalsStore } from '@/features/animals/store/animals.store'

export function useExistingDataWarning() {
  const auth = useAuthStore()
  const animals = useAnimalsStore()

  const isOpen = ref(false)
  let pending: (() => void | Promise<void>) | null = null

  async function guard(proceed: () => void | Promise<void>): Promise<void> {
    if (!animals.hasLoaded) await animals.load()
    const mustWarn = mustWarnBeforeSignIn({
      animalCount: animals.animals.length,
      hasAccount: auth.hasPlusAccount,
    })
    if (!mustWarn) {
      await proceed()
      return
    }
    pending = proceed
    isOpen.value = true
  }

  function continueSignIn(): void {
    const proceed = pending
    pending = null
    isOpen.value = false
    if (proceed) void proceed()
  }

  function cancel(): void {
    pending = null
    isOpen.value = false
  }

  return { isOpen, guard, continueSignIn, cancel }
}
