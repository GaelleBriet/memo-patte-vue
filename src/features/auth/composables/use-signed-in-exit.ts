import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { currentRestoreFlow } from '@/core/sync/service/restore-flow'
import { returnTo } from '@/shared/utils/return-to'
import { afterSignInRoute, asksRestore, signInReturnRoute } from '@/shared/utils/sign-in-route'

/** Où va l'écran une fois le compte ouvert : le parcours d'origine, ou « Restaurer mon carnet ». */
export function useSignedInExit(isSubmitting: Ref<boolean>) {
  const router = useRouter()
  const route = useRoute()

  const hasNoAnswer = ref(false)
  let isActive = true

  const returnRoute = computed(() => signInReturnRoute(route.query.from))

  function leave(): void {
    returnTo(router, returnRoute.value)
  }

  async function leaveSignedIn(): Promise<void> {
    const flow = currentRestoreFlow()
    if (!asksRestore(route.query) || flow === null) {
      leave()
      return
    }
    const next = afterSignInRoute(route.query, await flow.whenChecked())
    if (!isActive) return
    if (next === null) {
      isSubmitting.value = false
      hasNoAnswer.value = true
    } else void router.replace(next)
  }

  async function retryCheck(): Promise<void> {
    hasNoAnswer.value = false
    isSubmitting.value = true
    currentRestoreFlow()?.retryCheck()
    await leaveSignedIn()
  }

  onScopeDispose(() => {
    isActive = false
  })

  return { hasNoAnswer, leave, leaveSignedIn, retryCheck }
}
