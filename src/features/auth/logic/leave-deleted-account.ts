import type { Router } from 'vue-router'

export function leaveDeletedAccount(router: Router): void {
  const previous = router.options.history.state.back
  if (previous === router.resolve({ name: 'settings-account' }).fullPath) router.go(-2)
  else void router.replace({ name: 'settings' })
}
