import { onMounted, ref, watch } from 'vue'

import type { AccountIdentity } from '../logic/account-identity-of'
import { useAuthStore } from '../store/auth.store'

/** L'adresse du compte de l'appareil, lue à l'ouverture de l'écran, oubliée quand la session est fermée ; `null` sans compte Plus. */
export function useAccountIdentity() {
  const auth = useAuthStore()

  const identity = ref<AccountIdentity | null>(null)

  watch(
    () => auth.sessionState,
    (state) => {
      if (state === 'needs-sign-in') identity.value = null
    },
  )

  onMounted(async () => {
    if (auth.hasPlusAccount) identity.value = await auth.accountIdentity()
  })

  return { identity }
}
