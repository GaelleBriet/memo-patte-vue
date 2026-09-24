import type { RouteLocationRaw, Router } from 'vue-router'

/** Revient à `target` par l'historique quand c'est l'écran précédent : il n'est pas doublé. */
export function returnTo(router: Router, target: RouteLocationRaw): void {
  const previous = router.options.history.state.back
  if (typeof previous === 'string' && previous === router.resolve(target).fullPath) router.back()
  else void router.replace(target)
}
